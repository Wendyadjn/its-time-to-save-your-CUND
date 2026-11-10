import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUsageStore, dailyLimits, serviceDay, serviceUsage, trackServiceCall } from "../src/lib/service-usage";
import { GET } from "../src/app/api/services/route";

test("每日上限跨服务共享、并发不超额、重建后保留，按香港日期重置", async t => {
  const directory = await mkdtemp(join(tmpdir(), "canto-ledger-test-"));
  let now = Date.parse("2026-11-10T15:59:59Z");
  t.mock.method(Date, "now", () => now);
  process.env.DAILY_TRANSLATE_LIMIT = "2";
  process.env.DAILY_TTS_CHARACTER_LIMIT = "3";
  try {
    const a = createUsageStore(directory), b = createUsageStore(directory);
    const tickets = await Promise.all([a.reserve("translate", "groq", 5), b.reserve("translate", "siliconflow", 5), a.reserve("translate", "groq", 5)]);
    assert.equal(tickets.filter(Boolean).length, 2);
    await a.finish(tickets[0]!, "success");
    await a.finish(tickets[1]!, "network");
    const snapshot = await createUsageStore(directory).snapshot();
    assert.equal(snapshot.day, "2026-11-10");
    assert.equal(snapshot.counters["translate:groq"].succeeded, 1);
    assert.equal(snapshot.counters["translate:siliconflow"].failed, 1);
    assert.equal(await b.reserve("tts", "ondoku", 4), null);
    assert.ok(await a.reserve("tts", "ondoku", 3));
    assert.equal(await a.reserve("tts", "ondoku", 1), null);
    now += 2000;
    assert.equal(serviceDay(), "2026-11-11");
    assert.ok(await b.reserve("translate", "groq", 1));
    assert.equal(Object.keys((await b.snapshot()).counters).length, 1);
    const contents = await readFile(join(directory, "service-usage.json"), "utf8");
    assert.ok(!contents.includes("录音") && !contents.includes("Bearer"));
    await writeFile(join(directory, "service-usage.json"), "broken");
    await assert.rejects(() => a.reserve("translate", "groq", 1));
  } finally {
    delete process.env.DAILY_TRANSLATE_LIMIT; delete process.env.DAILY_TTS_CHARACTER_LIMIT;
  }
});

test("达到上限时不会调用服务商，失败计数、状态与密钥保密", async () => {
  process.env.DAILY_TRANSLATE_LIMIT = "0";
  let calls = 0;
  try {
    const blocked = await trackServiceCall("translate", "groq", 1, async () => { calls++; return Response.json({}); });
    assert.equal(blocked.status, 429); assert.equal(calls, 0);
    process.env.DAILY_TRANSLATE_LIMIT = "100";
    for (const [response, state] of [
      [Response.json({ translation: "你好" }), "success"],
      [Response.json({ error: "网络连接失败" }, { status: 502 }), "network"],
      [Response.json({ error: "Groq 拒绝了当前网络的连接，当前无法验证密钥或模型权限。" }, { status: 502 }), "network"],
      [Response.json({ error: "密钥验证失败" }, { status: 502 }), "auth"],
      [Response.json({ error: "超时" }, { status: 504 }), "timeout"],
      [Response.json({ error: "未生成所需音频，请检查账户剩余字数。" }, { status: 502 }), "audio_unavailable"],
    ] as const) {
      await trackServiceCall("translate", "groq", 1, async () => response);
      assert.equal((await serviceUsage().snapshot()).latest["translate:groq"].state, state);
    }
    process.env.GROQ_API_KEY = "private-groq-key";
    process.env.SILICONFLOW_API_KEY = "private-backup-key";
    process.env.ONDOKU_TOKEN = "x".repeat(64);
    const publicState = await GET();
    assert.equal(publicState.headers.get("cache-control"), "no-store");
    const data = await publicState.json();
    assert.equal(data.balance, "unknown");
    assert.equal(data.providers[0].configured, true);
    assert.deepEqual(data.providers.map((row: {id: string; name: string}) => [row.id, row.name]), [["groq", "Groq"], ["siliconflow", "硅基流动"]]);
    assert.equal(data.ondokuConfigured, true);
    assert.ok(!JSON.stringify(data).includes("private-") && !JSON.stringify(data).includes("x".repeat(64)));
    process.env.DAILY_TRANSLATE_LIMIT = "invalid";
    assert.equal(dailyLimits().translate, 0);
  } finally {
    for (const key of ["GROQ_API_KEY", "SILICONFLOW_API_KEY", "ONDOKU_TOKEN", "DAILY_TRANSLATE_LIMIT"]) delete process.env[key];
  }
});
