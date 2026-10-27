import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/tts/route";
import { OndokuSpeech } from "../src/lib/ondoku-speech";

test("Ondoku 路由校验、固定声线、额度提示与密钥保密", async t => {
  const previous = process.env.ONDOKU_TOKEN;
  const token = "a".repeat(64);
  let payload: unknown = {};
  let status = 200;
  let calls = 0;
  let expectedText = "你好";
  const mock = t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    calls++;
    assert.equal(url, "https://ondoku3.com/text_to_speech_api/");
    assert.equal((options.headers as Record<string,string>).token, token);
    assert.deepEqual(JSON.parse(options.body as string), { voice: "zh-HK-HiuGaaiNeural", text: expectedText, speed: 0.9, pitch: 0 });
    return Response.json(payload, { status });
  });
  const req = (text: unknown = "你好", origin = "http://localhost") => new Request("http://localhost/api/tts", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify({ text }) });
  try {
    delete process.env.ONDOKU_TOKEN;
    assert.equal((await POST(req())).status, 503);
    process.env.ONDOKU_TOKEN = token;
    assert.equal((await POST(req("你好", "https://evil.example"))).status, 403);
    for (const text of [null, "", "字".repeat(12001)]) assert.equal((await POST(req(text))).status, 400);
    assert.equal((await POST(req("字".repeat(22000)))).status, 413);
    assert.equal(calls, 0);
    payload = { share: 1, text: "你好", url: "https://storage.googleapis.com/ondoku3/voice/test.mp3" };
    const ok = await POST(req());
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { url: "https://storage.googleapis.com/ondoku3/voice/test.mp3" });
    expectedText = "你好，世界。";
    payload = { share: 1, text: "你好,世界。", url: "https://storage.googleapis.com/ondoku3/media/test.mp3" };
    assert.equal((await POST(req(expectedText))).status, 200);
    expectedText = "你好";
    for (const invalid of [
      { share: 0, text: "你好", url: "https://storage.googleapis.com/ondoku3/voice/notice.mp3" },
      { share: 1, text: "quota notice", url: "https://storage.googleapis.com/ondoku3/voice/notice.mp3" },
      { share: 1, text: "你好", url: "https://evil.example/file.mp3" },
      { share: 1, text: "你好", url: "javascript:alert(1)" },
      { share: 1, text: "你好", url: "https://storage.googleapis.com/other/media/test.mp3" },
    ]) { payload = invalid; assert.equal((await POST(req())).status, 502); }
    status = 400; payload = { error: token };
    const failed = await POST(req());
    assert.equal(failed.status, 502); assert.ok(!(await failed.text()).includes(token));
    status = 429; assert.equal((await POST(req())).status, 429);
  } finally { mock.mock.restore(); if (previous === undefined) delete process.env.ONDOKU_TOKEN; else process.env.ONDOKU_TOKEN = previous; }
});

test("Ondoku 依实际播放高亮，复用缓存，停止忽略旧请求", async () => {
  const audios: HTMLAudioElement[] = [];
  let calls = 0;
  const send: typeof fetch = async () => { calls++; return Response.json({ url: "https://storage.googleapis.com/ondoku3/voice/test.mp3" }); };
  const create = () => {
    const audio = { onplaying: null, onended: null, onerror: null, src: "", play: async () => {}, pause: () => {}, removeAttribute: () => {}, load: () => {} } as unknown as HTMLAudioElement;
    audios.push(audio); return audio;
  };
  const player = new OndokuSpeech(create, send);
  const active: (number|null)[] = [];
  const errors: string[] = [];
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  player.setRate(1.25);
  assert.throws(() => player.setRate(3), RangeError);
  const play = player.play(["测试甲", "测试乙"], i => active.push(i), e => errors.push(e));
  await tick(); assert.equal(audios[0].playbackRate, 1.25);
  assert.equal(audios[0].preservesPitch, true);
  audios[0].playbackRate = 1;
  audios[0].onloadedmetadata?.(new Event("loadedmetadata"));
  assert.equal(audios[0].playbackRate, 1.25);
  player.setRate(2); assert.equal(audios[0].playbackRate, 2);
  assert.equal(audios[0].defaultPlaybackRate, 2);
  assert.ok(active.every(value => value === null));
  audios[0].onplaying?.(new Event("playing")); assert.equal(active.at(-1), 0);
  audios[0].onended?.(new Event("ended")); await tick();
  assert.equal(audios[1].playbackRate, 2);
  audios[1].onplaying?.(new Event("playing")); assert.equal(active.at(-1), 1);
  audios[1].onended?.(new Event("ended")); await play;
  assert.equal(active.at(-1), null); assert.equal(calls, 2);
  const cached = player.play(["测试甲"], () => {}, e => errors.push(e));
  await tick(); player.stop(); await cached; assert.equal(calls, 2);
  let finish!: (response: Response) => void;
  const stale = new OndokuSpeech(create, () => new Promise(resolve => { finish = resolve; }));
  const before = audios.length;
  const pending = stale.play(["测试丙"], () => {}, e => errors.push(e));
  stale.stop(); finish(Response.json({ url: "https://storage.googleapis.com/ondoku3/voice/old.mp3" })); await pending;
  assert.equal(audios.length, before + 1); assert.ok(!audios.at(-1)!.src.includes("old.mp3")); assert.equal(errors.length, 0);
  const broken = player.play(["测试甲"], () => {}, e => errors.push(e));
  await tick(); audios.at(-1)!.onerror?.(new Event("error")); await broken;
  assert.match(errors[0], /加载失败/);
});


test("默认请求保持浏览器 fetch 的全局调用上下文", async t => {
  let called = false;
  const mock = t.mock.method(globalThis, "fetch", async function (this: unknown) {
    assert.equal(this, globalThis);
    called = true;
    return Response.json({ error: "测试额度提示" }, { status: 429 });
  });
  try {
    const errors: string[] = [];
    const player = new OndokuSpeech(() => ({ src: "", play: async () => {}, pause() {}, load() {}, removeAttribute() {} }) as unknown as HTMLAudioElement);
    await player.play(["默认请求上下文回归测试"], () => {}, message => errors.push(message));
    assert.equal(called, true);
    assert.deepEqual(errors, ["测试额度提示"]);
  } finally { mock.mock.restore(); }
});


test("单字先解锁音频，再等待网络，复听直接播放缓存", async () => {
  const order: string[] = [];
  const audios: HTMLAudioElement[] = [];
  const player = new OndokuSpeech(() => {
    const audio = { src: "", pause() {}, load() {}, removeAttribute() {}, play: async () => { order.push(audio.src.startsWith("data:") ? "unlock" : "speech"); } } as unknown as HTMLAudioElement;
    audios.push(audio); return audio;
  }, async () => { order.push("request"); return Response.json({url: "https://storage.googleapis.com/ondoku3/media/character.mp3"}); });
  const errors: string[] = [];
  const task = player.play(["今"], () => {}, e => errors.push(e));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(order, ["unlock", "request", "speech"]);
  audios[0].onended?.(new Event("ended")); await task;
  const replay = player.play(["今"], () => {}, e => errors.push(e));
  assert.deepEqual(order, ["unlock", "request", "speech", "speech"]);
  audios[1].onended?.(new Event("ended")); await replay;
  assert.equal(errors.length, 0);
});
