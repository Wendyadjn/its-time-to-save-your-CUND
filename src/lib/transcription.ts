export type TranscriptSegment = { text: string; start: number | null; end: number | null; issue: string | null };

export function reviewTranscription(data: { text: string; segments?: unknown }): TranscriptSegment[] {
  const raw = Array.isArray(data.segments) ? data.segments : [];
  const segments: TranscriptSegment[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object" || typeof value.text !== "string" || !value.text.trim()) continue;
    const timed = typeof value.start === "number" && Number.isFinite(value.start) && value.start >= 0 && typeof value.end === "number" && Number.isFinite(value.end) && value.end > value.start && value.end <= 300;
    const metrics = [value.avg_logprob, value.no_speech_prob, value.compression_ratio].every(n => typeof n === "number" && Number.isFinite(n));
    // 这些阈值只用于提示人工复听，不能证明文字正确或错误。
    const issue = /保留[粤粵][语語]原[话話]/u.test(value.text) ? "疑似提示词混入，请复听确认" : !metrics || !timed ? "缺少可靠的片段质量信息，请复听" : value.no_speech_prob >= 0.6 ? "可能是静音、噪声或误识别" : value.avg_logprob <= -0.5 || value.compression_ratio >= 2.4 ? "识别不确定，可能漏字或误识别" : null;
    segments.push({ text: value.text.trim(), start: timed ? value.start : null, end: timed ? value.end : null, issue });
  }
  const normalize = (text: string) => text.replace(/\s/g, "");
  if (!segments.length || normalize(segments.map(s => s.text).join("")) !== normalize(data.text)) {
    return [{ text: data.text.trim(), start: null, end: null, issue: "片段信息不完整，整段需要复听校对" }];
  }
  return segments;
}
