import { test } from "node:test";
import assert from "node:assert/strict";
import { convertScript, examples, MAX_LENGTH, resolveScript, translateDemo } from "../src/lib/translation";

test("全部例句双向翻译，接受简繁体输入", () => {
  for (const item of examples) {
    assert.equal(translateDemo(item.mandarin, "mandarin-cantonese"), item.cantonese);
    assert.equal(translateDemo(convertScript(item.cantonese, "traditional"), "cantonese-mandarin"), item.mandarin);
  }
});
test("简繁转换与自动偏好", () => {
  assert.equal(convertScript("广东话", "traditional"), "廣東話");
  assert.equal(convertScript("廣東話", "simplified"), "广东话");
  assert.equal(resolveScript("廣東話", "auto"), "traditional");
  assert.equal(resolveScript("广东话", "auto"), "simplified");
  assert.equal(resolveScript("廣東話", "simplified"), "simplified");
});
test("多段文本以及拒绝空白、未知文本和超长输入", () => {
  assert.equal(translateDemo(examples[0].mandarin + "\n" + examples[1].mandarin, "mandarin-cantonese"), examples[0].cantonese + "\n" + examples[1].cantonese);
  for (const text of ["  ", "这句话没有收录。", "你".repeat(MAX_LENGTH + 1)]) {
    assert.throws(() => translateDemo(text, "mandarin-cantonese"));
  }
});
