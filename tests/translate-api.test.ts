import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/translate/route";

test("翻译路由校验、保密、双向请求与上游错误处理（不调用真实 API）", async t => {
  const previous = process.env.GROQ_API_KEY;
  let result = new Response();
  let thrown: Error | null = null;
  let calls = 0;
  let sent: Record<string, unknown> = {};
  const mock = t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    calls++;
    sent = JSON.parse(options.body as string);
    assert.equal((options.headers as Record<string, string>).Authorization, "Bearer test-key-not-real");
    if (thrown) throw thrown;
    return result;
  });
  const request = (body: unknown, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/translate", {
    method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body),
  });
  const valid = { text: "明天我们一起去公园散步。", direction: "mandarin-cantonese" };
  try {
    delete process.env.GROQ_API_KEY;
    assert.equal((await POST(request(valid))).status, 503);
    const proxyRequest = new Request("http://localhost:3000/api/translate", {
      method: "POST", headers: { "Content-Type": "application/json", origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }, body: JSON.stringify(valid),
    });
    assert.equal((await POST(proxyRequest)).status, 503);
    assert.equal((await POST(request(valid, "https://other.example"))).status, 403);
    for (const body of [null, {}, { ...valid, text: " " }, { ...valid, text: "字".repeat(3001) }, { ...valid, direction: ["mandarin-cantonese"] }]) {
      assert.equal((await POST(request(body))).status, 400);
    }
    assert.equal((await POST(request({ ...valid, text: "字".repeat(12000) }))).status, 413);
    assert.equal((await POST(new Request("http://localhost/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }))).status, 400);
    assert.equal((await POST(new Request("http://localhost/api/translate", { method: "POST", body: "text" }))).status, 415);
    assert.equal(calls, 0);

    process.env.GROQ_API_KEY = "test-key-not-real";
    for (const direction of ["mandarin-cantonese", "cantonese-mandarin"]) {
      result = Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ translation: "明日我哋一齊去公園散步。" }) } }] });
      const response = await POST(request({ ...valid, direction }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const output = await response.json();
      assert.equal(output.translation, "明日我哋一齊去公園散步。");
      assert.ok(!JSON.stringify(output).includes("test-key-not-real"));
      const messages = sent.messages as { role: string; content: string }[];
      assert.equal(messages[1].content, valid.text);
      assert.ok(messages[0].content.includes(direction === "mandarin-cantonese" ? "香港粤语" : "通顺的普通话"));
    }
    for (const status of [429, 401, 500]) {
      result = new Response("private-provider-detail", { status });
      const response = await POST(request(valid));
      assert.equal(response.status, status === 429 ? 429 : 502);
      assert.ok(!(await response.text()).includes("private-provider-detail"));
    }
    for (const payload of [
      { choices: [{ finish_reason: "length", message: { content: "partial" } }] },
      { choices: [{ finish_reason: "stop", message: { content: "not JSON" } }] },
    ]) {
      result = Response.json(payload);
      assert.equal((await POST(request(valid))).status, 502);
    }
    thrown = new Error("network failure containing secret");
    assert.equal((await POST(request(valid))).status, 502);
    thrown = new DOMException("timeout", "TimeoutError");
    assert.equal((await POST(request(valid))).status, 504);
    thrown = null;
    result = Response.json({});
    await POST(request(valid));
    const before = calls;
    assert.equal((await POST(request(valid))).status, 429);
    assert.equal(calls, before);
  } finally {
    mock.mock.restore();
    if (previous === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previous;
  }
});
