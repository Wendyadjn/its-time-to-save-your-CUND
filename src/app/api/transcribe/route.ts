import { hasAudioSignature, MAX_AUDIO_BYTES, validateAudio } from "../../../lib/audio";

export const runtime = "nodejs";
// shortcut: 单进程限流只适合本地试用，公开部署前需统一登录与持久化限流。
let recentRequests: number[] = [];
const failure = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== (request.headers.get("host") ?? new URL(request.url).host)) return failure("不允许跨站调用。", 403);
    } catch { return failure("请求来源无效。", 403); }
  }
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) return failure("请使用音频文件上传请求。", 415);
  let file: File;
  try {
    const reader = request.body?.getReader();
    if (!reader) return failure("请上传音频。", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AUDIO_BYTES + 64_000) { await reader.cancel(); return failure("上传内容超过 10 MB 限制。", 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
    const audio = form.get("file");
    if (!(audio instanceof File) || form.getAll("file").length !== 1) return failure("请上传一个音频文件。", 400);
    file = audio;
    const error = validateAudio(file);
    if (error) return failure(error, file.size > MAX_AUDIO_BYTES ? 413 : 400);
    if (!hasAudioSignature(new Uint8Array(await file.slice(0, 16).arrayBuffer()), file.name)) return failure("音频格式与文件扩展名不匹配，请上传有效音频。", 400);
  } catch { return failure("无法读取上传文件，请重新选择音频。", 400); }
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return failure("请先在 .env.local 配置 GROQ_API_KEY 并重启服务。", 503);
  const now = Date.now();
  recentRequests = recentRequests.filter(time => now - time < 60_000);
  if (recentRequests.length >= 6) return failure("语音请求过于频繁，请一分钟后重试。", 429);
  recentRequests.push(now);
  const form = new FormData();
  form.set("file", file);
  form.set("model", "whisper-large-v3");
  form.set("response_format", "json");
  form.set("temperature", "0");
  // 不强制 zh，避免把粤语口语引导为普通话；提示只提供粤语字形风格。
  form.set("prompt", "以下係粵語口語錄音：我哋、佢哋、嘅、咗、喺、唔、冇、咩、點樣。保留粵語原話。");
  try {
    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]), cache: "no-store",
    });
    if (!response.ok) {
      if (response.status === 429) return failure("Groq 语音免费额度或速率达到上限，请稍后重试。", 429);
      if ([401, 403].includes(response.status)) return failure("Groq 密钥或语音模型访问权限无效。", 502);
      if ([400, 413, 422].includes(response.status)) return failure("语音服务无法解析此音频，请换用有效的较短 MP3 或 WAV。", 422);
      return failure("语音服务暂不可用，请稍后重试。", 502);
    }
    const data = await response.json();
    if (typeof data?.text !== "string" || !data.text.trim()) return failure("未识别到语音，请检查音量或换一段清晰录音。", 422);
    if (Array.from(data.text).length > 20_000) return failure("转写结果过长，请分段上传音频。", 422);
    return Response.json({ text: data.text.trim() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) return failure("语音转写超时或已取消，请缩短音频后重试。", 504);
    return failure("语音转写失败，请检查服务端网络后重试。", 502);
  }
}
