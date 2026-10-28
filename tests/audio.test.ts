import { test } from "node:test";
import assert from "node:assert/strict";
import { hasAudioSignature, MAX_AUDIO_BYTES, recordingExtension, recordingReminder, validateAudio } from "../src/lib/audio";
import { POST } from "../src/app/api/transcribe/route";

function makeWav(seconds = 1) {
  const bytes = Buffer.alloc(44 + Math.round(seconds * 8000) * 2);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}
const wav = makeWav();

test("音频大小、格式与签名校验", () => {
  assert.equal(validateAudio({ name: "test.wav", type: "audio/wav", size: 16 }), null);
  for (const file of [
    { name: "test.exe", type: "audio/wav", size: 16 },
    { name: "test.wav", type: "text/html", size: 16 },
    { name: "test.wav", type: "audio/wav", size: 0 },
    { name: "test.wav", type: "audio/wav", size: MAX_AUDIO_BYTES + 1 },
  ]) assert.ok(validateAudio(file));
  assert.equal(hasAudioSignature(wav, "test.wav"), true);
  assert.equal(hasAudioSignature(wav, "test.mp3"), false);
  assert.equal(hasAudioSignature(new TextEncoder().encode("<html>"), "test.wav"), false);
  assert.equal(hasAudioSignature(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), "record.webm"), true);
  assert.equal(hasAudioSignature(new TextEncoder().encode("0000ftypM4A "), "audio.m4a"), true);
  assert.equal(hasAudioSignature(new TextEncoder().encode("ID3tag"), "audio.mp3"), true);
  assert.equal(hasAudioSignature(new TextEncoder().encode("OggS"), "audio.ogg"), true);
  assert.equal(recordingExtension("audio/mp4"), "m4a");
  assert.equal(recordingExtension("audio/webm;codecs=opus"), "webm");
});

test("转写 API 校验与错误恢复，不调用真实 Groq", async t => {
  const previous = process.env.GROQ_API_KEY;
  const segment = { text: "我哋今日去飲茶。", start: 0, end: 1, avg_logprob: -0.1, no_speech_prob: 0.01, compression_ratio: 1.2 };
  let result = Response.json({ text: segment.text, segments: [segment] });
  let thrown: Error | null = null;
  let calls = 0;
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    calls++;
    assert.equal(url, "https://api.groq.com/openai/v1/audio/transcriptions");
    assert.equal((options.body as FormData).get("model"), "whisper-large-v3");
    assert.equal((options.body as FormData).get("language"), null);
    assert.equal((options.body as FormData).get("prompt"), null);
    assert.equal((options.body as FormData).get("response_format"), "verbose_json");
    assert.equal((options.body as FormData).get("timestamp_granularities[]"), "segment");
    assert.equal((options.headers as Record<string, string>).Authorization, "Bearer fake-test-key");
    if (thrown) throw thrown;
    return result;
  });
  const request = (file: File | null = new File([wav], "test.wav", { type: "audio/wav" }), origin = "http://localhost:3000") => {
    const form = new FormData();
    if (file) form.set("file", file);
    return new Request("http://localhost:3000/api/transcribe", { method: "POST", body: form, headers: { origin } });
  };
  try {
    delete process.env.GROQ_API_KEY;
    assert.equal((await POST(request())).status, 503);
    assert.equal((await POST(request(null))).status, 400);
    assert.equal((await POST(request(undefined, "https://other.example"))).status, 403);
    assert.equal((await POST(request(new File(["not audio"], "fake.wav", { type: "audio/wav" })))).status, 400);
    assert.equal((await POST(request(new File([wav], "bad.exe")))).status, 400);
    assert.equal((await POST(new Request("http://localhost:3000/api/transcribe", { method: "POST", body: "text" }))).status, 415);
    const tooLong = await POST(request(new File([makeWav(301)], "long.wav", { type: "audio/wav" })));
    assert.equal(tooLong.status, 422);
    assert.ok((await tooLong.text()).includes("五分钟"));
    assert.equal(calls, 0);
    process.env.GROQ_API_KEY = "fake-test-key";
    const success = await POST(request());
    assert.equal(success.status, 200);
    assert.deepEqual(await success.json(), { text: segment.text, segments: [{ text: segment.text, start: 0, end: 1, issue: null }] });
    now += 60_001;
    for (const status of [429, 401, 403, 400]) {
      result = new Response("private provider error", { status });
      const response = await POST(request());
      assert.equal(response.status, status === 429 ? 429 : status === 400 ? 422 : 502);
      const message = await response.text();
      assert.ok(!message.includes("private provider error"));
      if (status === 401) assert.ok(message.includes("重新启动"));
      if (status === 403) assert.ok(message.includes("whisper-large-v3"));
    }
    result = Response.json({ text: " " });
    assert.equal((await POST(request())).status, 422);
    thrown = new DOMException("timeout", "TimeoutError");
    assert.equal((await POST(request())).status, 504);
    const before = calls;
    assert.equal((await POST(request())).status, 429);
    assert.equal(calls, before);
  } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previous;
  }
});

test("五分钟边界、无效音频和倒计时提醒", async () => {
  const { validateAudioDuration } = await import("../src/lib/audio-duration");
  assert.equal(await validateAudioDuration(new File([makeWav(300)], "limit.wav")), null);
  assert.ok(await validateAudioDuration(new File([makeWav(300.1)], "long.wav")));
  assert.ok(await validateAudioDuration(new File(["bad"], "broken.wav")));
  assert.equal(recordingReminder(269), "");
  assert.match(recordingReminder(270), /30 秒/);
  assert.match(recordingReminder(290), /10 秒/);
  assert.match(recordingReminder(295), /5 秒/);
  assert.match(recordingReminder(300), /自动停止/);
});
