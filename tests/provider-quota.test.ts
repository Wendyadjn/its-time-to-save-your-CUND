import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseGroqQuota, parseOndokuCheck } from "../src/lib/provider-quota";
import { createUsageStore } from "../src/lib/service-usage";

test("官方额度严格读取响应头，区分日请求和分钟 Token，不推测缺失的余额", () => {
  const headers = new Headers({"x-ratelimit-limit-requests":"1000", "x-ratelimit-remaining-requests":"0", "x-ratelimit-reset-requests":"2h3m4.5s", "x-ratelimit-limit-tokens":"8000", "x-ratelimit-remaining-tokens":"7500", "x-ratelimit-reset-tokens":"500ms"});
  const quota = parseGroqQuota(headers, 1000)!;
  assert.deepEqual(quota.requests, {limit:1000, remaining:0, resetsAt:7385500});
  assert.deepEqual(quota.tokens, {limit:8000, remaining:7500, resetsAt:1500});
  assert.equal(parseGroqQuota(new Headers()), null);
  headers.set("x-ratelimit-remaining-requests", "-1"); headers.set("x-ratelimit-reset-requests", "untrusted");
  assert.deepEqual(parseGroqQuota(headers)!.requests, {limit:1000, remaining:null, resetsAt:null});
  const check = {remaining:0, checkedAt:Date.now(), renewalDate:"2026-12-01"};
  assert.deepEqual(parseOndokuCheck(check), check);
  for (const value of [null, {...check, remaining:-1}, {...check, remaining:1.5}, {...check, renewalDate:"2026-02-30"}, {...check, checkedAt:Date.now()+60000}]) assert.equal(parseOndokuCheck(value), null);
});

test("官方响应快照持久保留，但换 API 密钥后不显示旧账户额度", async () => {
  const previous = process.env.GROQ_API_KEY;
  const directory = await mkdtemp(join(tmpdir(), "canto-quota-test-"));
  try {
    process.env.GROQ_API_KEY = "account-a";
    const store = createUsageStore(directory);
    await store.recordGroqQuota("account-a", "model-a", new Headers({"x-ratelimit-remaining-requests":"42"}));
    const first = await createUsageStore(directory).snapshot();
    assert.equal(Object.values(first.groqQuota)[0].requests!.remaining, 42);
    process.env.GROQ_API_KEY = "account-b";
    assert.deepEqual((await store.snapshot()).groqQuota, {});
    await store.recordGroqQuota("account-b", "model-a", new Headers());
    assert.deepEqual((await store.snapshot()).groqQuota, {});
  } finally {
    if (previous === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = previous;
  }
});
