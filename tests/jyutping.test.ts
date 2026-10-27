import { test } from "node:test";
import assert from "node:assert/strict";
import { annotateJyutping } from "../src/lib/jyutping";
import { examples, convertScript } from "../src/lib/translation";

test("粤拼与原文字形、标点、换行及非汉字保持对齐", () => {
  for (const text of ["你好！我哋一齊去飲茶啦。\nHello 123🙂𠮷", "", ...examples.map(item => item.cantonese)]) {
    const tokens = annotateJyutping(text);
    assert.equal(tokens.map(token => token.character).join(""), text);
    for (const token of tokens) {
      if (token.jyutping) assert.match(token.jyutping, /^[a-z]+[1-6](?: [a-z]+[1-6])*$/);
    }
  }
});

test("基础读音以及简繁例句均有注音", () => {
  assert.deepEqual(annotateJyutping("你好").map(token => token.jyutping), ["nei5", "hou2"]);
  for (const example of examples) {
    for (const text of [example.cantonese, convertScript(example.cantonese, "traditional")]) {
      for (const token of annotateJyutping(text).filter(token => token.isHan)) {
        assert.ok(token.jyutping, `缺少注音：${token.character}`);
      }
    }
  }
});
