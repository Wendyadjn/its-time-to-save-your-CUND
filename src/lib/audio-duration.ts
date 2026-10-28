import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffprobe from "@ffprobe-installer/ffprobe";
import { MAX_RECORD_SECONDS } from "./audio";

const run = promisify(execFile);

export async function validateAudioDuration(file: File): Promise<string | null> {
  const directory = await mkdtemp(join(tmpdir(), "canto-audio-"));
  try {
    const path = join(directory, "audio");
    await writeFile(path, new Uint8Array(await file.arrayBuffer()));
    // 扫描音频包，兼容浏览器录制的、没有 duration 元数据的 WebM。
    const { stdout } = await run(ffprobe.path, ["-v", "error", "-protocol_whitelist", "file,pipe", "-select_streams", "a:0", "-show_entries", "format=duration:packet=pts_time,duration_time", "-of", "json", path], { timeout: 15000, maxBuffer: 16 * 1024 * 1024 });
    const data = JSON.parse(stdout);
    const packets = data.packets as { pts_time?: string; duration_time?: string }[] | undefined;
    if (!packets?.length) return "无法确认音频时长，请换用有效的 MP3 或 WAV。";
    let start = Infinity, end = -Infinity, total = 0;
    for (const packet of packets) {
      const time = Number(packet.pts_time), duration = Number(packet.duration_time);
      if (Number.isFinite(time)) { start = Math.min(start, time); end = Math.max(end, time + (Number.isFinite(duration) ? duration : 0)); }
      if (Number.isFinite(duration)) total += duration;
    }
    const duration = Math.max(Number(data.format?.duration) || 0, Number.isFinite(end - start) ? end - start : 0, total);
    if (!Number.isFinite(duration) || duration <= 0) return "无法确认音频时长，请换用有效的 MP3 或 WAV。";
    return duration > MAX_RECORD_SECONDS ? "音频超过五分钟，已拒绝上传转写。请裁剪至五分钟以内。" : null;
  } catch {
    return "无法读取音频时长，请换用有效的 MP3 或 WAV。";
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
