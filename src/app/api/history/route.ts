import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { publicCloudConfig } from "../../../lib/cloud-config";
import { historyRow, isHistoryId, parseHistoryDraft } from "../../../lib/history";
import { MAX_AUDIO_BYTES, hasAudioSignature, validateAudio } from "../../../lib/audio";
import { validateAudioDuration } from "../../../lib/audio-duration";

export const runtime = "nodejs";
const bucket = "canto-history-audio";
const failure = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
const json = (data: unknown) => Response.json(data, { headers: { "Cache-Control": "no-store" } });
async function authenticate(request: Request) {
  const config = publicCloudConfig();
  if (!config) return failure("云端历史尚未配置，请填写 Supabase 项目连接资料。", 503);
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
  if (!token || token.length > 8192) return failure("请先登录后再访问历史记录。", 401);
  const client = createClient(config.url, config.key, { global: { headers: { Authorization: `Bearer ${token}` }, fetch: (url, init) => fetch(url, { ...init, cache: "no-store", signal: AbortSignal.any([...(request.method === "GET" ? [request.signal] : []), ...(init?.signal ? [init.signal] : []), AbortSignal.timeout(20000)]) }) }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return failure("登录已失效，请重新登录。", 401);
  return { client, userId: data.user.id };
}
function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  try { return !origin || new URL(origin).host === (request.headers.get("host") ?? new URL(request.url).host); } catch { return false; }
}

export async function GET(request: Request) {
  try {
    const auth = await authenticate(request); if (auth instanceof Response) return auth;
    const { client, userId } = auth;
    const params = new URL(request.url).searchParams, id = params.get("id");
    if (id !== null) {
      if (!isHistoryId(id)) return failure("历史记录编号无效。", 400);
      const { data, error } = await client.from("learning_history").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
      if (error) return failure("无法读取历史，请确认已执行数据库权限脚本。", 503);
      if (!data) return failure("历史记录不存在或无权访问。", 404);
      const draft = parseHistoryDraft({ kind: data.kind, title: data.title, direction: data.direction, sourceText: data.source_text, originalText: data.original_text, resultText: data.result_text, provider: data.provider, script: data.script, segments: data.segments });
      if (!draft) return failure("这条历史的数据格式无效。", 422);
      let audioUrl: string | null = null;
      if (typeof data.audio_path === "string" && data.audio_path.startsWith(userId + "/")) {
        const signed = await client.storage.from(bucket).createSignedUrl(data.audio_path, 3600);
        if (!signed.error) audioUrl = signed.data.signedUrl;
      }
      return json({ ...draft, id: data.id, createdAt: data.created_at, audioUrl, audioName: data.audio_name, audioUnavailable: Boolean(data.audio_path) && !audioUrl });
    }
    const pageText = params.get("page") ?? "0";
    if (!/^\d{1,5}$/.test(pageText)) return failure("页码无效。", 400);
    const page = Number(pageText), search = (params.get("q") ?? "").trim();
    if (search.length > 80) return failure("搜索标题不能超过 80 字。", 400);
    let query = client.from("learning_history").select("id,title,kind,created_at,audio_path", { count: "exact" }).eq("user_id", userId).order("created_at", { ascending: false }).order("id", { ascending: false }).range(page * 20, page * 20 + 19);
    if (search) query = query.ilike("title", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, error, count } = await query;
    if (error) return failure("无法读取历史，请确认已执行数据库权限脚本。", 503);
    return json({ items: data, total: count ?? 0, hasMore: (page + 1) * 20 < (count ?? 0) });
  } catch { return failure("云端历史连接失败，请检查网络后重试。", 503); }
}

export async function POST(request: Request) {
  if (!validOrigin(request)) return failure("不允许跨站保存历史。", 403);
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) return failure("历史保存请求格式无效。", 415);
  try {
    const auth = await authenticate(request); if (auth instanceof Response) return auth;
    const { client, userId } = auth;
    const reader = request.body?.getReader(); if (!reader) return failure("保存内容为空。", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_AUDIO_BYTES + 1000000) { await reader.cancel(); return failure("历史内容过大，请缩短文字或音频。", 413); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
    const raw = form.get("record");
    if (typeof raw !== "string" || raw.length > 240000 || form.getAll("record").length !== 1) return failure("历史内容无效。", 400);
    let parsed: unknown; try { parsed = JSON.parse(raw); } catch { return failure("历史内容格式无效。", 400); }
    const draft = parseHistoryDraft(parsed); if (!draft) return failure("历史内容不完整或超出长度限制。", 400);
    const audio = form.get("audio");
    let audioBytes: Uint8Array | null = null, extension: string | null = null;
    let audioPath: string | null = null, audioName: string | null = null;
    if (audio !== null) {
      if (!(audio instanceof File) || form.getAll("audio").length !== 1 || draft.kind !== "voice") return failure("原音文件无效。", 400);
      const invalid = validateAudio(audio);
      if (invalid) return failure(invalid, 400);
      if (!hasAudioSignature(new Uint8Array(await audio.slice(0, 16).arrayBuffer()), audio.name)) return failure("原音文件内容与格式不匹配。", 400);
      const durationError = await validateAudioDuration(audio); if (durationError) return failure(durationError, 422);
      extension = audio.name.split(".").pop()!.toLowerCase();
      audioBytes = new Uint8Array(await audio.arrayBuffer());
      audioName = audio.name.split(/[\\/]/).pop()!.slice(0, 200);
    }
    // 相同账号、内容和原音使用同一主键，让并发点击及网络重试也不会新增记录。
    const hash = createHash("sha256").update(JSON.stringify([userId, draft, extension]));
    if (audioBytes) hash.update(audioBytes);
    const hex = hash.digest("hex");
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    const existing = () => client.from("learning_history").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
    const previous = await existing();
    if (previous.error) return failure("无法检查历史是否已保存，请稍后重试。", 503);
    if (previous.data) return json({ id, duplicate: true });
    if (audioBytes && extension) {
      audioPath = `${userId}/${id}.${extension}`;
      const mime: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", webm: "audio/webm", ogg: "audio/ogg" };
      const uploaded = await client.storage.from(bucket).upload(audioPath, audioBytes, { contentType: mime[extension], upsert: false });
      if (uploaded.error) {
        const completed = await existing();
        if (completed.data) return json({ id, duplicate: true });
        return failure("原音可能正在保存，或上传失败。请稍后重试；当前内容仍保留。", 503);
      }
    }
    const saved = await client.from("learning_history").insert(historyRow(draft, id, userId, audioPath, audioName)).select("id").single();
    if (saved.error) {
      if (saved.error.code === "23505") {
        const completed = await existing();
        if (completed.data) return json({ id, duplicate: true });
      }
      if (audioPath) {
        const cleanup = await client.storage.from(bucket).remove([audioPath]);
        if (cleanup.error) return failure("文字保存失败，上传的音频也未能清理。请在私有音频存储中检查，避免重复上传。", 503);
      }
      return failure("保存失败，请确认已执行数据库权限脚本；当前编辑内容仍保留。", 503);
    }
    return json({ id });
  } catch { return failure("历史保存未完成，请先刷新历史列表确认是否已保存，再决定是否重试。", 503); }
}

export async function DELETE(request: Request) {
  if (!validOrigin(request)) return failure("不允许跨站删除历史。", 403);
  try {
    const auth = await authenticate(request); if (auth instanceof Response) return auth;
    const { client, userId } = auth;
    const id = new URL(request.url).searchParams.get("id");
    if (!isHistoryId(id)) return failure("历史记录编号无效。", 400);
    const { data, error } = await client.from("learning_history").select("id,audio_path").eq("id", id).eq("user_id", userId).maybeSingle();
    if (error) return failure("无法读取待删除记录。", 503);
    if (!data) return failure("历史记录不存在或无权访问。", 404);
    if (data.audio_path) {
      if (typeof data.audio_path !== "string" || !data.audio_path.startsWith(userId + "/")) return failure("音频权限不匹配，已停止删除。", 403);
      const removed = await client.storage.from(bucket).remove([data.audio_path]);
      if (removed.error) return failure("音频删除失败，历史仍保留，请稍后重试。", 503);
    }
    const deleted = await client.from("learning_history").delete().eq("id", id).eq("user_id", userId);
    if (deleted.error) return failure("音频已处理，但文字记录删除未完成，请刷新后重试。", 503);
    return json({ deleted: true });
  } catch { return failure("删除未完成，请刷新历史列表后确认。", 503); }
}
