import { test } from "node:test";
import assert from "node:assert/strict";
import { CantoneseSpeech, findCantoneseVoice, splitSentences } from "../src/lib/speech";

function setup(voices = [{ lang: "zh-HK", name: "Cantonese" }]) {
  const spoken: SpeechSynthesisUtterance[] = [];
  let cancellations = 0;
  const synth = {
    getVoices: () => voices,
    cancel: () => { cancellations++; },
    speak: (utterance: SpeechSynthesisUtterance) => { spoken.push(utterance); utterance.onstart?.({} as SpeechSynthesisEvent); },
  } as unknown as SpeechSynthesis;
  const player = new CantoneseSpeech(synth, text => ({ text } as SpeechSynthesisUtterance));
  return { player, spoken, cancellations: () => cancellations };
}

test("分句保留所有文字及空白，粤语匹配不回退普通话", () => {
  for (const text of ["你好！我哋去飲茶。\n再見；好呀！", "\n。！？", "", "🙂長段落".repeat(300)]) {
    assert.equal(splitSentences(text).join(""), text);
  }
  assert.equal(findCantoneseVoice([{ lang: "zh-CN", name: "Mandarin" }]), undefined);
  assert.equal(findCantoneseVoice([{ lang: "yue-Hant-HK", name: "voice" }])?.lang, "yue-Hant-HK");
});

test("长句分块播放，保留文本，结束后清除高亮", () => {
  const { player, spoken } = setup();
  const active: (number | null)[] = [];
  const errors: string[] = [];
  const text = "你好🙂".repeat(120);
  player.play([text, "再見。"], index => active.push(index), message => errors.push(message));
  for (let i = 0; i < spoken.length; i++) spoken[i].onend?.({} as SpeechSynthesisEvent);
  assert.equal(spoken.map(item => item.text).join(""), text + "再見。");
  assert.ok(spoken.every(item => Array.from(item.text).length <= 160));
  assert.equal(active.at(-1), null);
  assert.ok(active.includes(1));
  assert.deepEqual(errors, []);
});

test("停止与切换播放后忽略旧回调", () => {
  const { player, spoken } = setup();
  const active: (number | null)[] = [];
  player.play(["第一句。", "第二句。"], index => active.push(index), assert.fail);
  const old = spoken[0];
  player.play(["新句。"], index => active.push(index), assert.fail);
  const count = active.length;
  old.onend?.({} as SpeechSynthesisEvent);
  old.onerror?.({ error: "canceled" } as SpeechSynthesisErrorEvent);
  old.onstart?.({} as SpeechSynthesisEvent);
  assert.equal(spoken.length, 2);
  assert.equal(active.length, count);
  player.stop();
  spoken[1].onend?.({} as SpeechSynthesisEvent);
  assert.equal(active.length, count);
});

test("缺少粤语声线、纯标点和播放错误均明确报错", () => {
  const missing = setup([{ lang: "zh-CN", name: "Mandarin" }]);
  const errors: string[] = [];
  missing.player.play(["你好"], () => {}, message => errors.push(message));
  assert.equal(missing.spoken.length, 0);
  const normal = setup();
  normal.player.play(["。\n"], () => {}, message => errors.push(message));
  assert.equal(normal.spoken.length, 0);
  normal.player.play(["你好"], () => {}, message => errors.push(message));
  normal.spoken[0].onerror?.({ error: "network" } as SpeechSynthesisErrorEvent);
  assert.equal(errors.length, 3);
  assert.ok(normal.cancellations() >= 3);
});
