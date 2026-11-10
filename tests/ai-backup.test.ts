import { test } from "node:test";
import assert from "node:assert/strict";
import { getAiService } from "../src/lib/ai-service";
import { POST as translate } from "../src/app/api/translate/route";
import { POST as transcribe } from "../src/app/api/transcribe/route";

function wav() {
  const bytes = Buffer.alloc(16044);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(16000, 40);
  const form = new FormData(); form.set("file", new File([bytes], "test.wav", { type: "audio/wav" }));
  return new Request("http://localhost:3000/api/transcribe", { method: "POST", body: form });
}
const translation = () => new Request("http://localhost:3000/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "我们去喝茶。", direction: "mandarin-cantonese" }) });

test("备用服务使用独立密钥和模型，不请求 Groq；缺失置信度时保留校对警示", async t => {
  const previous = { provider: process.env.AI_PROVIDER, key: process.env.SILICONFLOW_API_KEY };
  let status = 200;
  let invalid = false;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    calls++;
    assert.equal((options.headers as Record<string, string>).Authorization, "Bearer backup-test-key");
    assert.ok(url.startsWith("https://api.siliconflow.cn/v1/"));
    if (status !== 200) return new Response("private detail containing backup-test-key", { status });
    if (url.endsWith("/chat/completions")) {
      const body = JSON.parse(options.body as string);
      assert.equal(body.model, "XingChenAGI/Xing4.0-29B");
      assert.equal(body.max_tokens, 4096);
      assert.equal(body.reasoning_effort, undefined);
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: invalid ? "invalid JSON" : JSON.stringify({ translation: "我哋去飲茶。" }) } }] });
    }
    const body = options.body as FormData;
    assert.equal(body.get("model"), "FunAudioLLM/SenseVoiceSmall");
    assert.equal(body.get("prompt"), null);
    assert.equal(body.get("response_format"), null);
    assert.equal(body.get("timestamp_granularities[]"), null);
    return Response.json({ text: invalid ? " " : "我哋去飲茶。", segments: [{ text: "不能信任备用接口的伪造元数据", start: 0, end: 1, avg_logprob: 0 }] });
  });
  try {
    process.env.AI_PROVIDER = "siliconflow";
    delete process.env.SILICONFLOW_API_KEY;
    assert.equal((await translate(translation())).status, 503);
    assert.equal((await transcribe(wav())).status, 503);
    assert.equal(calls, 0);
    process.env.SILICONFLOW_API_KEY = "backup-test-key";
    const translated = await (await translate(translation())).json();
    assert.equal(translated.provider, "硅基流动");
    assert.equal(translated.translation, "我哋去飲茶。");
    assert.ok(!JSON.stringify(translated).includes("backup-test-key"));
    const recognized = await (await transcribe(wav())).json();
    assert.equal(recognized.text, "我哋去飲茶。");
    assert.equal(recognized.segments[0].start, null);
    assert.equal(recognized.segments[0].end, null);
    assert.match(recognized.segments[0].issue, /校对全文/);
    for (const code of [401, 403, 429]) {
      status = code;
      for (const response of [await translate(translation()), await transcribe(wav())]) {
        assert.equal(response.status, code === 429 ? 429 : 502);
        const text = await response.text();
        assert.ok(text.includes("硅基流动"));
        assert.ok(!text.includes("backup-test-key"));
      }
    }
    status = 200; invalid = true;
    assert.equal((await translate(translation())).status, 502);
    assert.equal((await transcribe(wav())).status, 422);
    process.env.AI_PROVIDER = "typo";
    assert.equal(getAiService(), null);
    assert.equal((await translate(translation())).status, 503);
  } finally {
    if (previous.provider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = previous.provider;
    if (previous.key === undefined) delete process.env.SILICONFLOW_API_KEY; else process.env.SILICONFLOW_API_KEY = previous.key;
  }
});
