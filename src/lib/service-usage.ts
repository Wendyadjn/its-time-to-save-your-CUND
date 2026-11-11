import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parseGroqQuota, type GroqQuota } from "./provider-quota";

export type ServiceKind = "translate" | "transcribe" | "tts";
export type ServiceProvider = "groq" | "siliconflow" | "ondoku";
export type CallState = "success" | "network" | "auth" | "limited" | "timeout" | "failed" | "rejected" | "audio_unavailable";
type Counter = { attempts: number; succeeded: number; failed: number; characters: number };
type Latest = { startedAt: number; completedAt: number; state: CallState };
type Ledger = { version: 1; days: Record<string, Record<string, Counter>>; latest: Record<string, Latest>; groqQuota?: Record<string, GroqQuota> };
export const quotaKey = (key: string) => createHash("sha256").update(key).digest("hex").slice(0, 24);
const empty = (): Ledger => ({ version: 1, days: {}, latest: {} });
const counter = (): Counter => ({ attempts: 0, succeeded: 0, failed: 0, characters: 0 });
export const serviceDay = (now = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
export function dailyLimits() {
  const limit = (name: string, fallback: number) => {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === "") return fallback;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  };
  return { translate: limit("DAILY_TRANSLATE_LIMIT", 100), transcribe: limit("DAILY_TRANSCRIBE_LIMIT", 20), tts: limit("DAILY_TTS_LIMIT", 100), ttsCharacters: limit("DAILY_TTS_CHARACTER_LIMIT", 10000) };
}

// shortcut: 文件账本仅适合单进程与可写持久磁盘；多实例部署时改用数据库事务统一额度。
export function createUsageStore(directory: string) {
  const shared = globalThis as typeof globalThis & { __cantoUsageQueues?: Map<string, Promise<unknown>> };
  const queues = shared.__cantoUsageQueues ??= new Map<string, Promise<unknown>>();
  const file = join(directory, "service-usage.json");
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = (queues.get(directory) ?? Promise.resolve()).then(operation);
    queues.set(directory, next.catch(() => {}));
    return next;
  };
  async function read(): Promise<Ledger> {
    try {
      const data = JSON.parse(await readFile(file, "utf8"));
      if (data.version !== 1 || !data.days || !data.latest) throw new Error("Invalid usage ledger");
      for (const day of Object.values(data.days) as Record<string, Counter>[]) {
        for (const value of Object.values(day)) {
          if (![value.attempts, value.succeeded, value.failed, value.characters].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error("Invalid usage counter");
        }
      }
      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty();
      throw error;
    }
  }
  async function save(data: Ledger) {
    await mkdir(directory, { recursive: true });
    await writeFile(file + ".tmp", JSON.stringify(data), { mode: 0o600 });
    await rename(file + ".tmp", file);
  }
  return {
    snapshot: () => serial(async () => {
      const data = await read();
      return { day: serviceDay(), counters: data.days[serviceDay()] ?? {}, latest: data.latest, limits: dailyLimits(), groqQuota: Object.fromEntries(Object.entries(data.groqQuota ?? {}).filter(([key]) => key.startsWith(quotaKey(process.env.GROQ_API_KEY?.trim() ?? "") + ":"))) };
    }),
    recordGroqQuota: (apiKey: string, model: string, headers: Headers) => serial(async () => {
      const quota = parseGroqQuota(headers); if (!quota) return;
      const data = await read();
      const prefix = quotaKey(apiKey) + ":";
      data.groqQuota = Object.fromEntries(Object.entries(data.groqQuota ?? {}).filter(([key]) => key.startsWith(prefix)));
      data.groqQuota[prefix + model] = quota;
      await save(data);
    }),
    reserve: (kind: ServiceKind, provider: ServiceProvider, characters: number) => serial(async () => {
      const data = await read(), day = serviceDay(), limits = dailyLimits();
      const rows = data.days[day] ?? {};
      const attempts = Object.entries(rows).filter(([key]) => key.startsWith(kind + ":")).reduce((sum, [, value]) => sum + value.attempts, 0);
      const usedCharacters = Object.entries(rows).filter(([key]) => key.startsWith("tts:")).reduce((sum, [, value]) => sum + value.characters, 0);
      if (attempts >= limits[kind] || (kind === "tts" && usedCharacters + characters > limits.ttsCharacters)) return null;
      const key = `${kind}:${provider}`, row = rows[key] ?? counter();
      row.attempts++; row.characters += characters; rows[key] = row; data.days[day] = rows;
      for (const old of Object.keys(data.days).sort().slice(0, -7)) delete data.days[old];
      await save(data);
      return { day, key, startedAt: Date.now() };
    }),
    finish: (ticket: { day: string; key: string; startedAt: number }, state: CallState) => serial(async () => {
      const data = await read(), row = data.days[ticket.day]?.[ticket.key];
      if (!row) throw new Error("Missing usage reservation");
      if (state === "success") row.succeeded++; else row.failed++;
      if (!data.latest[ticket.key] || ticket.startedAt >= data.latest[ticket.key].startedAt) data.latest[ticket.key] = { startedAt: ticket.startedAt, completedAt: Date.now(), state };
      await save(data);
    }),
  };
}
let store: ReturnType<typeof createUsageStore> | undefined;
export const serviceUsage = () => store ??= createUsageStore(process.env.SERVICE_DATA_DIR || join(process.cwd(), ".data"));

async function responseState(response: Response): Promise<CallState> {
  if (response.ok) return "success";
  if (response.status === 429) return "limited";
  if (response.status === 504) return "timeout";
  const data = await response.clone().json().catch(() => ({}));
  const message = typeof data.error === "string" ? data.error : "";
  if (/未生成所需音频/.test(message)) return "audio_unavailable";
  if (/Groq 拒绝了当前网络/.test(message)) return "network";
  if (/网络/.test(message) && /权限/.test(message)) return "rejected";
  if (/网络|连接/.test(message)) return "network";
  if (/密钥|权限|Token/.test(message)) return "auth";
  return "failed";
}
export async function trackServiceCall(kind: ServiceKind, provider: ServiceProvider, characters: number, operation: () => Promise<Response>): Promise<Response> {
  let ticket;
  try { ticket = await serviceUsage().reserve(kind, provider, characters); }
  catch { return Response.json({ error: "无法读取或保存本站用量，请检查服务器存储后重试。" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  if (!ticket) return Response.json({ error: "已达到本站今日使用上限（香港时间），请明天再试或由站点管理员调整上限。" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  let response: Response;
  try { response = await operation(); }
  catch { response = Response.json({ error: "服务请求失败，请稍后重试。" }, { status: 502 }); }
  try { await serviceUsage().finish(ticket, await responseState(response)); }
  catch { /* 已发出的请求不能重发；保留预占次数，防止重复消耗额度。 */ }
  return response;
}
