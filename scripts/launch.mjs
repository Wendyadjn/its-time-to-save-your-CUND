import { mkdir, readFile, writeFile, readdir, access, rm, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { get } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve, delimiter } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function fingerprint(root, paths) {
  const hash = createHash('sha256');
  async function add(path) {
    hash.update(path + '\0');
    let data;
    try { data = await readFile(join(root,path)); }
    catch (error) {
      if (error.code === 'EISDIR') { for (const child of (await readdir(join(root,path))).sort()) await add(join(path,child)); return; }
      if (error.code === 'ENOENT') { hash.update('missing'); return; }
      throw error;
    }
    hash.update(data);
  }
  for (const path of paths) await add(path);
  return hash.digest('hex');
}
export async function findPort(start = 3000) {
  for (let port = start; port < start + 100; port++) {
    const server = createServer();
    const free = await new Promise((resolve,reject) => {
      server.once('error',error => ['EADDRINUSE','EACCES'].includes(error.code) ? resolve(false) : reject(error));
      server.listen(port,'127.0.0.1',() => server.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error('没有可用的本机端口，请关闭不需要的应用后重试。');
}
export function ready(port,instance) {
  return new Promise(resolve => {
    const finish = value => { clearTimeout(deadline); resolve(value); };
    const deadline = setTimeout(() => { request.destroy(); finish(false); },3000);
    const request = get({hostname:'127.0.0.1',port,path:`/api/health?check=${Date.now()}`,agent:false,headers:{'Cache-Control':'no-cache'},timeout:3000},response => {
      let body = '';
      response.on('data',chunk => { body += chunk; if(body.length>4096) request.destroy(); });
      response.on('error',() => finish(false));
      response.on('end',() => { try { const data=JSON.parse(body); finish(response.statusCode===200 && data.app==='olivia-cantorigo' && data.instance===instance); } catch { finish(false); } });
    });
    request.on('timeout',() => request.destroy()); request.on('error',() => finish(false));
  });
}
function openBrowser(url) {
  if (process.env.CANTO_NO_BROWSER === '1') return;
  const command = process.platform === 'darwin' ? ['open',[url]] : process.platform === 'win32' ? ['rundll32.exe',['url.dll,FileProtocolHandler',url]] : ['xdg-open',[url]];
  const child = spawn(command[0],command[1],{stdio:'ignore',detached:true}); child.on('error',() => console.log('请手动打开上方地址。')); child.unref();
}
async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('需要 Node.js 22 或以上，请使用 Start 启动器。');
  const root = resolve(dirname(fileURLToPath(import.meta.url)),'..'); process.chdir(root);
  const state = join(root,'.launcher'); await mkdir(state,{recursive:true});
  const lock = join(state,'running');
  const instance = createHash('sha256').update(root).digest('hex');
  try { await mkdir(lock); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner;
    try { owner = JSON.parse(await readFile(join(lock,'owner.json'),'utf8')); } catch { throw new Error('另一启动器正在准备，请稍后重试；若上次异常退出，请关闭其窗口后删除 .launcher/running 再启动。'); }
    if (Number.isInteger(owner.port) && await ready(owner.port,instance)) { console.log(`已有实例：http://localhost:${owner.port}`); openBrowser(`http://localhost:${owner.port}`); return; }
    let alive = true; try { process.kill(owner.pid,0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
    if (alive) throw new Error('已有启动器正在安装或启动，请查看它的窗口，勿重复安装。');
    throw new Error('上次启动异常退出。确认旧窗口已关闭后，删除 .launcher/running 目录再重试；不要删除 .data。');
  }
  let child; let stopping = false;
  const owner = {pid:process.pid,port:null};
  await writeFile(join(lock,'owner.json'),JSON.stringify(owner),{mode:0o600});
  function stop() { stopping = true; if (child) child.kill(); }
  process.on('SIGINT',stop); process.on('SIGTERM',stop);
  async function run(args,env=process.env) {
    child = spawn(process.execPath,args,{cwd:root,env,stdio:'inherit'});
    const running = child;
    const code = await new Promise((resolve,reject) => { running.once('error',reject); running.once('exit',code => resolve(code)); });
    child = null;
    if (stopping) throw new Error("已停止本次启动，已有配置保留。");
    if (code !== 0) throw new Error('准备或运行失败。请检查网络、磁盘空间和以上提示，然后重新启动；原配置不会被覆盖。');
  }
  try {
    try { await writeFile('.env.local',await readFile('.env.example'),{flag:'wx',mode:0o600}); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    // 检查临时目录可写，不触碰配置或用量账本。
    const {tmpdir} = await import('node:os');
    await mkdir(join(tmpdir(),`canto-launch-${process.pid}`));
    await rm(join(tmpdir(),`canto-launch-${process.pid}`),{recursive:true});
    const dependencyKey = `${process.platform}/${process.arch}/${process.versions.node}/` + await fingerprint(root,['package.json','package-lock.json']);
    const marker = join(state,'prepared.json'); let prepared = {};
    try { prepared = JSON.parse(await readFile(marker,'utf8')); } catch {}
    let installed = false; try { await access('node_modules/next/dist/bin/next'); installed = true; } catch {}
    if (!installed || prepared.dependencies !== dependencyKey) {
      console.log('首次准备依赖，需要联网。');
      const npmRoot = process.platform === 'win32' ? dirname(process.execPath) : resolve(dirname(process.execPath),'../lib');
      let npm = join(npmRoot,'node_modules/npm/bin/npm-cli.js');
      try { await access(npm); } catch {
        npm = '';
        for (const directory of (process.env.PATH ?? '').split(delimiter)) {
          const candidate = process.platform === 'win32' ? join(directory,'node_modules/npm/bin/npm-cli.js') : join(directory,'npm');
          try { npm = await realpath(candidate); break; } catch {}
        }
        if (!npm) throw new Error('未找到 npm，请安装带 npm 的 Node 或使用启动器的私有运行环境。');
      }
      await run([npm,'ci','--no-audit','--no-fund']);
      prepared = {dependencies:dependencyKey}; await writeFile(marker,JSON.stringify(prepared),{mode:0o600});
    }
    const require = createRequire(join(root,'package.json'));
    try { execFileSync(require('@ffprobe-installer/ffprobe').path,['-version'],{timeout:10000,stdio:'ignore'}); } catch { throw new Error('音频检查程序 FFprobe 无法执行，请检查平台支持或系统安全提示。'); }
    const buildKey = dependencyKey + await fingerprint(root,['src','public','next.config.ts','tsconfig.json','postcss.config.mjs']);
    let built = false; try { await access('.next/BUILD_ID'); built = true; } catch {}
    if (!built || prepared.build !== buildKey) {
      console.log('正在准备生产网页，首次启动需要一些时间。');
      await run(['node_modules/next/dist/bin/next','build','--webpack']);
      prepared.build = buildKey; await writeFile(marker,JSON.stringify(prepared),{mode:0o600});
    }
    const port = await findPort(); owner.port = port;
    await writeFile(join(lock,'owner.json'),JSON.stringify(owner),{mode:0o600});
    console.log(`正在启动：http://localhost:${port}。关闭前请在此窗口按 Ctrl+C。`);
    const running = run(['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{...process.env,CANTO_LAUNCH_ID:instance});
    let exited = false; running.finally(() => { exited = true; }).catch(() => {});
    let healthy = false;
    for (let attempt=0; attempt<60 && !exited; attempt++) {
      if (await ready(port,instance)) { healthy = true; break; }
      await new Promise(resolve => setTimeout(resolve,1000));
    }
    if (stopping) { await running.catch(() => {}); return; }
    if (!healthy) { child?.kill(); await running.catch(() => {}); throw new Error('启动后未就绪，请查看以上提示后重试。'); }
    console.log(`网页已就绪：http://localhost:${port}`);
    openBrowser(`http://localhost:${port}`);
    await running;
  } finally { process.off('SIGINT',stop); process.off('SIGTERM',stop); await rm(lock,{recursive:true,force:true}); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode=1; });
