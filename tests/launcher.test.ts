import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {fingerprint,findPort} from '../scripts/launch.mjs';

test('启动缓存随文件内容变化，忽略目录遍历顺序；缺失可选目录可处理',async()=>{
 const root=await mkdtemp(join(tmpdir(),'canto-launch-test-'));
 await mkdir(join(root,'src'));await writeFile(join(root,'src/a'),'one');
 const first=await fingerprint(root,['src','public']);
 assert.equal(first,await fingerprint(root,['src','public']));
 await writeFile(join(root,'src/a'),'two');
 assert.notEqual(first,await fingerprint(root,['src','public']));
});
test('端口占用时另选，不结束占用者',async()=>{
 const server=createServer();
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=(server.address() as {port:number}).port;
 try {assert.notEqual(await findPort(port),port);assert.ok(server.listening);}
 finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('健康检查使用新连接与动态查询，验证实例身份',async()=>{
 const {createServer}=await import('node:http');
 const {ready}=await import('../scripts/launch.mjs');
 const server=createServer((req,res)=>{
  assert.ok(req.url?.startsWith('/api/health?check='));
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({app:'olivia-cantorigo',instance:'test'}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=(server.address() as {port:number}).port;
 try {assert.equal(await ready(port,'test'),true);assert.equal(await ready(port,'wrong'),false);}
 finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
