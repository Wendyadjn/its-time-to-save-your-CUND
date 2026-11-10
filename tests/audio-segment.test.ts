import { test } from "node:test";
import assert from "node:assert/strict";
import { playAudioSegment } from "../src/lib/audio-segment";

class FakeAudio extends EventTarget {
  currentTime = 0;
  paused = true;
  pause() { this.paused = true; }
  async play() { this.paused = false; }
}

test("复听按原音时间停止，不随缓冲或倍速提前结束，取消不会影响下一句", t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const audio = new FakeAudio();
  const errors: string[] = [];
  const stop = playAudioSegment(audio as unknown as HTMLAudioElement, 10, 12, () => errors.push("error"));
  assert.equal(audio.currentTime, 10);
  t.mock.timers.tick(3000);
  assert.equal(audio.paused, false);
  audio.currentTime = 12.02;
  t.mock.timers.tick(25);
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 12);
  stop();
  const cancel = playAudioSegment(audio as unknown as HTMLAudioElement, 20, 21, () => errors.push("error"));
  cancel();
  playAudioSegment(audio as unknown as HTMLAudioElement, 30, 32, () => errors.push("error"));
  audio.currentTime = 31;
  t.mock.timers.tick(25);
  assert.equal(audio.paused, false);
  audio.currentTime = 32;
  t.mock.timers.tick(25);
  assert.equal(audio.paused, true);
  assert.deepEqual(errors, []);
});

test("时间无效或播放失败时提示错误，不继续播放原音", async t => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const audio = new FakeAudio();
  let errors = 0;
  playAudioSegment(audio as unknown as HTMLAudioElement, 5, 4, () => errors++);
  assert.equal(errors, 1);
  audio.play = async () => { throw new Error("blocked"); };
  playAudioSegment(audio as unknown as HTMLAudioElement, 0, 1, () => errors++);
  await Promise.resolve();
  assert.equal(errors, 2);
  assert.equal(audio.paused, true);
});
