import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewTranscription } from "../src/lib/transcription";

test("逐段质量标注保留原文与时间，不因部分清晰而隐藏可疑片段", () => {
  const good = { text: "我哋去飲茶。", start: 0, end: 2, avg_logprob: -0.1, no_speech_prob: 0.01, compression_ratio: 1.2 };
  const bad = { ...good, text: "保留粤语原话。", start: 2, end: 4 };
  const result = reviewTranscription({ text: good.text + bad.text, segments: [good, bad] });
  assert.equal(result[0].issue, null);
  assert.match(result[1].issue!, /提示词/);
  assert.equal(result[1].start, 2);
  assert.equal(result[1].text, bad.text);
  for (const change of [{avg_logprob: -0.8}, {no_speech_prob: 0.9}, {compression_ratio: 3}, {avg_logprob: undefined}, {end: NaN}]) {
    assert.ok(reviewTranscription({ text: good.text, segments: [{...good, ...change}] })[0].issue);
  }
});

test("缺失片段与文字不完整不能当作全篇可靠", () => {
  for (const segments of [undefined, [], [null], [{text: "部分文字"}]]) {
    const reviewed = reviewTranscription({text: "完整文字", segments});
    assert.equal(reviewed[0].text, "完整文字");
    assert.ok(reviewed[0].issue);
    assert.equal(reviewed[0].start, null);
  }
});
