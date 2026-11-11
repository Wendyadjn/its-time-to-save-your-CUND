import type { Direction, Script } from "./translation";
import type { TranscriptSegment } from "./transcription";

export type HistoryDraft = {
  kind: "text" | "voice"; title: string; direction: Direction; sourceText: string; originalText: string;
  resultText: string; provider: string; script: Script; segments: TranscriptSegment[];
};
export type HistoryItem = HistoryDraft & { id: string; createdAt: string; audioUrl: string | null; audioName: string | null };
export type HistorySummary = { id: string; title: string; kind: "text" | "voice"; created_at: string; audio_path: string | null };
export const isHistoryId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function parseHistoryDraft(value: unknown): HistoryDraft | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const text = (key: string, max: number, required = false) => typeof v[key] === "string" && Array.from(v[key] as string).length <= max && (!required || (v[key] as string).trim().length > 0);
  if (!["text", "voice"].includes(v.kind as string) || !["mandarin-cantonese", "cantonese-mandarin"].includes(v.direction as string)
    || !["auto", "simplified", "traditional"].includes(v.script as string) || !["groq", "siliconflow", "demo", "unknown"].includes(v.provider as string)
    || !text("title", 80, true) || !text("sourceText", 20000, true) || !text("originalText", 20000) || !text("resultText", 12000)
    || !Array.isArray(v.segments) || v.segments.length > 1000 || JSON.stringify(v.segments).length > 120000) return null;
  if (v.kind === "voice" && v.direction !== "cantonese-mandarin") return null;
  const segments: TranscriptSegment[] = [];
  for (const row of v.segments) {
    if (!row || typeof row.text !== "string" || Array.from(row.text).length > 20000 || (row.issue !== null && (typeof row.issue !== "string" || row.issue.length > 200))) return null;
    const timed = typeof row.start === "number" && Number.isFinite(row.start) && row.start >= 0 && typeof row.end === "number" && Number.isFinite(row.end) && row.end > row.start && row.end <= 300;
    if (!timed && !(row.start === null && row.end === null)) return null;
    segments.push({ text: row.text, start: row.start, end: row.end, issue: row.issue });
  }
  return { kind: v.kind as HistoryDraft["kind"], title: (v.title as string).trim(), direction: v.direction as Direction, sourceText: v.sourceText as string, originalText: v.originalText as string, resultText: v.resultText as string, provider: v.provider as string, script: v.script as Script, segments };
}
export function historyRow(draft: HistoryDraft, id: string, userId: string, audioPath: string | null, audioName: string | null) {
  return { id, user_id: userId, kind: draft.kind, title: draft.title, direction: draft.direction, source_text: draft.sourceText, original_text: draft.originalText, result_text: draft.resultText, provider: draft.provider, script: draft.script, segments: draft.segments, audio_path: audioPath, audio_name: audioName };
}
