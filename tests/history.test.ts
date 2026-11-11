import { test } from "node:test";
import assert from "node:assert/strict";
import { publicCloudConfig } from "../src/lib/cloud-config";
import { parseHistoryDraft, historyRow, isHistoryId } from "../src/lib/history";
import { GET, POST, DELETE } from "../src/app/api/history/route";

const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const draft = { kind: "voice", title: "饮茶", direction: "cantonese-mandarin", sourceText: "我哋去飲茶。", originalText: "我哋去飲茶。", resultText: "我们去喝茶。", provider: "siliconflow", script: "simplified", segments: [{ text: "我哋去飲茶。", start: null, end: null, issue: "待核对" }] };

test("公开配置拒绝服务端高权限密钥；历史内容与时间范围严格校验", () => {
  assert.equal(publicCloudConfig("https://project.supabase.co", "sb_secret_private"), null);
  const jwt = (role: string) => `header.${Buffer.from(JSON.stringify({role})).toString("base64url")}.signature`;
  assert.equal(publicCloudConfig("https://project.supabase.co", jwt("service_role")), null);
  assert.ok(publicCloudConfig("https://project.supabase.co", jwt("anon")));
  assert.equal(publicCloudConfig("https://user:password@project.supabase.co", "sb_publishable_test"), null);
  assert.ok(publicCloudConfig("https://project.supabase.co", "sb_publishable_test"));
  assert.ok(parseHistoryDraft(draft));
  for (const invalid of [null, {...draft, sourceText: " "}, {...draft, resultText: "字".repeat(12001)}, {...draft, kind: "bad"}, {...draft, provider: "arbitrary"}, {...draft, segments: [{text: "字", start: 0, end: 301, issue: null}]}, {...draft, segments: [{text: "字", start: 1, end: 0, issue: null}]}]) assert.equal(parseHistoryDraft(invalid), null);
  assert.equal(isHistoryId("../private"), false);
  assert.equal(historyRow(parseHistoryDraft({...draft, user_id: b})!, id, a, null, null).user_id, a);
});

test("历史 API 验证身份、限制访问当前账号，原音删除失败时保留文字", async t => {
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_PUBLISHABLE_KEY;
  const req = (method = "GET", suffix = "", body?: FormData, token = "user-a") => new Request("http://localhost:3000/api/history" + suffix, {method, body, headers: {Authorization: `Bearer ${token}`, Origin: "http://localhost:3000"}});
  assert.equal((await GET(req())).status, 503);
  process.env.SUPABASE_URL = "https://project.supabase.co"; process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  let uploads = 0, cleanups = 0, insertionFailed = false;
  let dbDeletes = 0, saved: Record<string, unknown> | null = null, signed = 0, storageFailed = false;
  const records = new Map<string, Record<string, unknown>>();
  const stored = { ...historyRow(parseHistoryDraft(draft)!, id, a, `${a}/${id}.wav`, "原音.wav"), created_at: "2026-11-10T00:00:00Z" };
  const mock = t.mock.method(globalThis, "fetch", async (url: string | URL | Request, options?: RequestInit) => {
    const target = new URL(typeof url === "string" || url instanceof URL ? url : url.url);
    assert.equal(target.origin, "https://project.supabase.co");
    const headers = new Headers(options?.headers);
    assert.equal(headers.get("authorization"), "Bearer user-a");
    if (target.pathname === "/auth/v1/user") return Response.json({id: a, aud: "authenticated", role: "authenticated", email: "learner@example.invalid", app_metadata: {}, user_metadata: {}, created_at: "2026-11-10T00:00:00Z"});
    if (target.pathname.startsWith("/storage/v1/object/sign/")) { signed++; return Response.json({signedURL: `/object/sign/canto-history-audio/${a}/${id}.wav?token=private-playback`}); }
    if (target.pathname.startsWith("/storage/v1/object/canto-history-audio/") && options?.method === "POST") { uploads++; assert.ok(target.pathname.includes(a + "/")); assert.equal(headers.get("content-type"), "audio/wav"); return Response.json({Key: "test"}); }
    if (target.pathname === "/storage/v1/object/canto-history-audio" && options?.method === "DELETE") { cleanups++; return storageFailed ? Response.json({message: "denied"}, {status: 403}) : Response.json([]); }
    assert.equal(target.pathname, "/rest/v1/learning_history");
    if (options?.method === "POST") {
      saved = JSON.parse(options.body as string);
      if (insertionFailed) return Response.json({message: "db failed", code: "42501"}, {status: 403});
      if (records.has(saved!.id as string)) return Response.json({message: "duplicate", code: "23505"}, {status: 409});
      records.set(saved!.id as string, saved!);
      return Response.json({id: saved!.id});
    }
    assert.equal(target.searchParams.get("user_id"), `eq.${a}`);
    if (options?.method === "DELETE") { dbDeletes++; return new Response(null, {status: 204}); }
    if (target.searchParams.get("select") === "id") {
      const found = records.get(target.searchParams.get("id")!.slice(3));
      return Response.json(found ? [{id: found.id}] : []);
    }
    if (target.searchParams.get("id") === `eq.${b}`) return Response.json([]);
    return Response.json([stored], {headers: {"content-range": "0-0/1"}});
  });
  try {
    assert.equal((await GET(new Request("http://localhost:3000/api/history"))).status, 401);
    assert.equal((await POST(new Request("http://localhost:3000/api/history", {method:"POST", headers:{Origin:"https://other.example","Content-Type":"multipart/form-data; boundary=x"}}))).status, 403);
    const record = await (await GET(req("GET", `?id=${id}`))).json();
    assert.equal(record.sourceText, draft.sourceText);
    assert.ok(record.audioUrl.includes("private-playback")); assert.equal(signed, 1);
    assert.equal((await GET(req("GET", `?id=${b}`))).status, 404);
    assert.equal((await DELETE(req("DELETE", `?id=${b}`))).status, 404);
    assert.equal((await GET(req("GET", "?page=-1"))).status, 400);
    const form = new FormData(); form.set("record", JSON.stringify({...draft, user_id: b}));
    const response = await POST(req("POST", "", form));
    assert.equal(response.status, 200);
    assert.equal(saved!.user_id, a); assert.equal(saved!.audio_path, null);
    const repeated = await (await POST(req("POST", "", form))).json();
    assert.equal(repeated.id, (await response.json()).id); assert.equal(repeated.duplicate, true);
    assert.equal(records.size, 1);
    const changed = new FormData(); changed.set("record", JSON.stringify({...draft, sourceText: "另一句原文"}));
    const concurrent = await Promise.all([POST(req("POST", "", changed)), POST(req("POST", "", changed))]);
    assert.ok(concurrent.every(result => result.status === 200));
    const concurrentResults = await Promise.all(concurrent.map(result => result.json()));
    assert.equal(concurrentResults[0].id, concurrentResults[1].id);
    assert.equal(records.size, 2);
    const bytes = Buffer.alloc(16044); bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(16000, 40);
    const withAudio = new FormData(); withAudio.set("record", JSON.stringify(draft)); withAudio.set("audio", new File([bytes], "原音.wav", {type:"audio/x-wav"}));
    insertionFailed = true;
    assert.equal((await POST(req("POST", "", withAudio))).status, 503);
    assert.equal(uploads, 1); assert.equal(cleanups, 1);
    insertionFailed = false;
    const audioSaved = await (await POST(req("POST", "", withAudio))).json();
    const uploadsBeforeRepeat = uploads;
    const audioRepeated = await (await POST(req("POST", "", withAudio))).json();
    assert.equal(audioRepeated.id, audioSaved.id); assert.equal(audioRepeated.duplicate, true);
    assert.equal(uploads, uploadsBeforeRepeat);
    assert.equal(records.size, 3);
    storageFailed = true;
    assert.equal((await DELETE(req("DELETE", `?id=${id}`))).status, 503);
    assert.equal(dbDeletes, 0);
    storageFailed = false;
    assert.equal((await DELETE(req("DELETE", `?id=${id}`))).status, 200);
    assert.equal(dbDeletes, 1);
  } finally {
    mock.mock.restore(); delete process.env.SUPABASE_URL; delete process.env.SUPABASE_PUBLISHABLE_KEY;
  }
});
