import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWebServer } from './server.js';
import { getWorkingDiff, getWorkingDiffFiles, resolveWorkspacePath } from './files.js';
import { execFileSync } from 'node:child_process';
import { get } from 'node:http';
import { runtimeMessageSchema } from '@codemap-ai/web/contracts';

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'codemap-web-test-')));
  const workspacePath = join(root, 'repo');
  const assetsPath = join(root, 'assets');
  await mkdir(workspacePath); await mkdir(assetsPath);
  await writeFile(join(assetsPath, 'index.html'), '<html>CodeMap</html>');
  return {root, workspacePath, assetsPath};
}

test('canonical workspace paths reject traversal and escaping symlinks, including new files', async () => {
  const f = await fixture();
  try {
    await symlink(f.root, join(f.workspacePath, 'escape'));
    await assert.rejects(resolveWorkspacePath(f.workspacePath, '../outside'));
    await assert.rejects(resolveWorkspacePath(f.workspacePath, 'escape/new/deep.txt', true));
    assert.equal(await resolveWorkspacePath(f.workspacePath, 'new/file.txt', true), join(f.workspacePath, 'new/file.txt'));
  } finally {await rm(f.root, {recursive:true,force:true});}
});

test('working diff supports unborn repositories and untracked files', async () => {
  const f = await fixture();
  try {
    execFileSync('git', ['init','-q'], {cwd:f.workspacePath});
    await writeFile(join(f.workspacePath, 'new.ts'), 'export const n = 1;\n');
    const files = await getWorkingDiffFiles(f.workspacePath);
    assert.equal(files[0]?.status, 'added'); assert.equal(files[0]?.path, 'new.ts');
    assert.match(files[0]?.modified ?? '', /n = 1/);
    assert.match(await getWorkingDiff(f.workspacePath), /@@ -0,0 \+1/);
  } finally {await rm(f.root,{recursive:true,force:true});}
});

test('HTTP binds loopback and protects commands with cookie and origin', async () => {
  const f = await fixture();
  const running = await startWebServer({...f, port:0, runtime:false, index:false});
  try {
    const rejected = await fetch(running.url + '/api/bootstrap', {headers:{Origin:'https://evil.example'}});
    assert.equal(rejected.status,403); assert.equal(rejected.headers.get('set-cookie'),null);
    const bootstrap = await fetch(running.url + '/api/bootstrap');
    assert.equal(bootstrap.status,200);
    const cookie = bootstrap.headers.get('set-cookie')!.split(';')[0]!;
    assert.equal((await bootstrap.json()).workspacePath, f.workspacePath);
    assert.equal((await fetch(running.url + '/api/command', {method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
    assert.equal((await fetch(running.url + '/api/command', {method:'POST',headers:{Cookie:cookie,Origin:running.url,'content-type':'application/json'},body:'{}'})).status,400);
    await writeFile(join(f.workspacePath,'safe.txt'),'safe');
    const good = await fetch(running.url + '/api/command', {method:'POST',headers:{Cookie:cookie,Origin:running.url,'content-type':'application/json'},body:JSON.stringify({type:'read_file',requestId:'file-1',filePath:'safe.txt'})});
    assert.equal(good.status,200); assert.equal((await good.json()).result.content,'safe');
    const bad = await fetch(running.url + '/api/command', {method:'POST',headers:{Cookie:cookie,Origin:running.url,'content-type':'application/json'},body:JSON.stringify({type:'read_file',requestId:'file-2',filePath:'../outside'})});
    assert.equal(bad.status,403);
    const sse = await fetch(running.url + '/api/events',{headers:{Cookie:cookie}});
    assert.match(sse.headers.get('content-type') ?? '',/text\/event-stream/);
    const reader = sse.body!.getReader(); const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /snapshot/);
    for(const entry of first.split('\n\n').filter(e=>e.startsWith('data: '))) runtimeMessageSchema.parse(JSON.parse(entry.slice(6)));
    await reader.cancel();
  } finally {await running.close(); await rm(f.root,{recursive:true,force:true});}
});

test('working diff preserves renamed paths and deleted content', async()=>{
  const f=await fixture();
  try {
    execFileSync('git',['init','-q'],{cwd:f.workspacePath});
    execFileSync('git',['config','user.name','CodeMap Test'],{cwd:f.workspacePath});
    execFileSync('git',['config','user.email','test@example.invalid'],{cwd:f.workspacePath});
    await writeFile(join(f.workspacePath,'old.ts'),'export const n = 1;\n');
    await writeFile(join(f.workspacePath,'deleted.ts'),'deleted content\n');
    execFileSync('git',['add','.'],{cwd:f.workspacePath});
    execFileSync('git',['commit','-qm','fixture'],{cwd:f.workspacePath});
    execFileSync('git',['mv','old.ts','new.ts'],{cwd:f.workspacePath});
    await rm(join(f.workspacePath,'deleted.ts'));
    const files=await getWorkingDiffFiles(f.workspacePath);
    const renamed=files.find(file=>file.path==='new.ts');
    assert.equal(renamed?.status,'renamed');assert.equal(renamed?.oldPath,'old.ts');assert.equal(renamed?.original,renamed?.modified);
    const deleted=files.find(file=>file.path==='deleted.ts');
    assert.equal(deleted?.status,'deleted');assert.equal(deleted?.original,'deleted content\n');assert.equal(deleted?.modified,'');
  } finally {await rm(f.root,{recursive:true,force:true});}
});

test('HTTP rejects Host rebinding, cross-site bootstrap and static symlinks',async()=>{
  const f=await fixture();
  await writeFile(join(f.root,'secret.txt'),'secret');
  await symlink(join(f.root,'secret.txt'),join(f.assetsPath,'leak.txt'));
  const running=await startWebServer({...f,port:0,runtime:false,index:false});
  try {
    const rebound=await new Promise<number|undefined>((resolve,reject)=>{get(running.url+'/api/bootstrap',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});
    assert.equal(rebound,403);
    const crossSite=await fetch(running.url+'/api/bootstrap',{headers:{'sec-fetch-site':'cross-site'}});
    assert.equal(crossSite.status,403);assert.equal(crossSite.headers.get('set-cookie'),null);
    assert.equal((await fetch(running.url+'/leak.txt')).status,403);
  }finally {await running.close();await rm(f.root,{recursive:true,force:true});}
});

test('two workspace servers keep independent cookies in the same browser jar',async()=>{
  const f=await fixture();
  const first=await startWebServer({...f,port:0,runtime:false,index:false});
  const second=await startWebServer({...f,port:0,runtime:false,index:false});
  try {
    const one=(await fetch(first.url+'/api/bootstrap')).headers.get('set-cookie')!.split(';')[0]!;
    const two=(await fetch(second.url+'/api/bootstrap')).headers.get('set-cookie')!.split(';')[0]!;
    assert.notEqual(one.split('=')[0],two.split('=')[0]);
    const cookie=`${one}; ${two}`;
    for(const running of [first,second]) {
      const res=await fetch(running.url+'/api/command',{method:'POST',headers:{Cookie:cookie,'content-type':'application/json'},body:JSON.stringify({type:'get_branch_name',requestId:crypto.randomUUID()})});
      assert.equal(res.status,200);
    }
  }finally{await first.close();await second.close();await rm(f.root,{recursive:true,force:true});}
});
