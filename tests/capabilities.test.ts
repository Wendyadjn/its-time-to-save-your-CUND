import { test } from "node:test";
import assert from "node:assert/strict";
import { publicCapabilities } from "../src/lib/capabilities";
import { POST as translate } from "../src/app/api/translate/route";
import { POST as tts } from "../src/app/api/tts/route";
import { POST as transcribe } from "../src/app/api/transcribe/route";

test("配置按功能独立公开，默认全关，不返回密钥", () => {
  assert.deepEqual(publicCapabilities({}), {groq:false, siliconflow:false, tts:false});
  const env = {GROQ_API_KEY:" ", SILICONFLOW_API_KEY:"private-key", ONDOKU_TOKEN:"x".repeat(64)};
  assert.deepEqual(publicCapabilities(env), {groq:false, siliconflow:true, tts:true});
  assert.equal(publicCapabilities({ONDOKU_TOKEN:"invalid"}).tts, false);
  assert.ok(!JSON.stringify(publicCapabilities(env)).includes("private-key"));
});

test("无密钥直接请求真实服务也不能调用上游", async t => {
  const old = [process.env.GROQ_API_KEY, process.env.SILICONFLOW_API_KEY, process.env.ONDOKU_TOKEN];
  delete process.env.GROQ_API_KEY; delete process.env.SILICONFLOW_API_KEY; delete process.env.ONDOKU_TOKEN;
  let calls = 0;
  t.mock.method(globalThis,"fetch",async () => { calls++; throw new Error("不应联网"); });
  const request = (path:string,body:object) => new Request(`http://localhost:3000/api/${path}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  try {
    assert.equal((await translate(request("translate",{provider:"groq",text:"你好",direction:"mandarin-cantonese"}))).status,503);
    assert.equal((await translate(request("translate",{provider:"siliconflow",text:"你好",direction:"mandarin-cantonese"}))).status,503);
    assert.equal((await tts(request("tts",{text:"你好"}))).status,503);
    const form = new FormData(); form.set("provider","groq");
    // 无效文件应在本地被拒绝，不触发模型调用。
    form.set("file",new File(["not audio"],"bad.wav",{type:"audio/wav"}));
    assert.ok(!(await transcribe(new Request("http://localhost:3000/api/transcribe",{method:"POST",body:form}))).ok);
    assert.equal(calls,0);
  } finally {
    for (const [index,key] of ["GROQ_API_KEY","SILICONFLOW_API_KEY","ONDOKU_TOKEN"].entries()) {
      if(old[index]===undefined) delete process.env[key]; else process.env[key]=old[index];
    }
  }
});
