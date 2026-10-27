export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_RECORD_SECONDS = 120;
export const AUDIO_ACCEPT = ".mp3,.wav,.m4a,.webm,.ogg";

export function validateAudio(file: Pick<File, "name" | "size" | "type">): string | null {
  if (!/\.(mp3|wav|m4a|webm|ogg)$/i.test(file.name)) return "请选择 MP3、WAV、M4A、WebM 或 OGG 音频。";
  if (!file.size) return "音频为空，请重新录音或选择文件。";
  if (file.size > MAX_AUDIO_BYTES) return "音频不能超过 10 MB，请缩短或压缩后重试。";
  if (file.type && !/^(audio\/|video\/webm|application\/ogg|application\/octet-stream)/i.test(file.type)) return "文件类型不是支持的音频。";
  return null;
}

export function hasAudioSignature(bytes: Uint8Array, name: string): boolean {
  const ascii = (start: number, count: number) => String.fromCharCode(...bytes.slice(start, start + count));
  switch (name.split(".").pop()?.toLowerCase()) {
    case "wav": return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE";
    case "m4a": return ascii(4, 4) === "ftyp";
    case "mp3": return ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    case "webm": return [0x1a, 0x45, 0xdf, 0xa3].every((byte, index) => bytes[index] === byte);
    case "ogg": return ascii(0, 4) === "OggS";
    default: return false;
  }
}

export function recordingExtension(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}
