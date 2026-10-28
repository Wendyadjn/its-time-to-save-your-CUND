export const runtime = "nodejs";
// shortcut: 单进程限流只适合本地试用，公开部署前需登录与持久化限流。
let recentRequests: number[] = [];
function failure(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const host = request.headers.get("host") ?? new URL(request.url).host;
      if (new URL(origin).host !== host) return failure("不允许跨站调用。", 403);
    } catch { return failure("请求来源无效。", 403); }
  }
  if (!request.headers.get("content-type")?.includes("application/json")) return failure("请发送 JSON 请求。", 415);

  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return failure("请求内容为空。", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64_000) { await reader.cancel(); return failure("请求内容过大。", 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return failure("请求 JSON 无效。", 400); }

  if (!body || typeof body !== "object" || !("text" in body) || typeof body.text !== "string") return failure("朗读文本无效。", 400);
  const text = body.text.trim();
  if (!text || Array.from(text).length > 12000) return failure("请输入 1–12000 字朗读文本。", 400);
  const token = process.env.ONDOKU_TOKEN?.trim();
  if (!token || token.length !== 64) return failure("请在 .env.local 配置有效的 ONDOKU_TOKEN 并重启服务。", 503);
  const now = Date.now();
  recentRequests = recentRequests.filter(time => now - time < 60000);
  if (recentRequests.length >= 20) return failure("朗读请求过于频繁，请稍后重试。", 429);
  recentRequests.push(now);
  try {
    const response = await fetch("https://ondoku3.com/text_to_speech_api/", {
      method: "POST", headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ voice: "zh-HK-HiuGaaiNeural", text, speed: 1, pitch: 0 }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(60000)]), cache: "no-store",
    });
    if (!response.ok) return failure(response.status === 429 ? "Ondoku 请求达到上限，请稍后重试。" : "Ondoku 生成失败，请检查 Token、账户额度后重试。", response.status === 429 ? 429 : 502);
    const data = await response.json();
    // 额度不足也可能返回 HTTP 200 的提示音，不能仅依据状态码判断成功。
    if (data?.share !== 1 || typeof data.text !== "string" || data.text.normalize("NFKC") !== text.normalize("NFKC") || typeof data.url !== "string") return failure("Ondoku 未生成所需音频，请检查账户剩余字数。", 502);
    const url = new URL(data.url);
    if (url.protocol !== "https:" || url.hostname !== "storage.googleapis.com" || !/^\/ondoku3\/(voice|media)\/.+\.mp3$/.test(url.pathname) || url.username || url.password) return failure("Ondoku 返回的音频地址无效。", 502);
    return Response.json({ url: url.href }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? "语音生成超时或已取消，请重试。" : "无法连接 Ondoku 或音频响应无效，请稍后重试。", error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? 504 : 502);
  }
}
