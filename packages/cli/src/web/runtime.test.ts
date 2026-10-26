import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceRuntime, defaultWebWorkerPath } from './runtime.js';
import { defaultWebAssetsPath } from './server.js';
import { fileURLToPath } from 'node:url';
import type { RuntimeMessage } from '@codemap-ai/web/contracts';

test('runtime retains live snapshot, serves abort while send runs, and rejects requests on crash', async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'codemap-runtime-test-')));
  const worker=join(root,'worker.mjs');
  await writeFile(worker,`
    process.on('message',m=>{
      const id=m.type==='agent'?m.command.requestId:m.requestId;
      if(m.type==='initialize') {
        process.send({type:'ready',workspacePath:m.workspacePath,settings:{provider:'9router',baseUrl:'http://localhost:4000/v1',defaultModel:'coder',availableModels:[],hasApiKey:false,hasApiToken:false}});
        process.send({type:'request_result',requestId:id});return;
      }
      if(m.type==='agent' && m.command.type==='send') {
        process.send({type:'agent_event',event:{type:'status',status:'running',requestId:id}});
        process.send({type:'agent_event',event:{type:'token',text:'hello',requestId:id}});
        setTimeout(()=>process.exit(2),200);return;
      }
      process.send({type:'request_result',requestId:id,result:true});
    });
  `);
  const events:RuntimeMessage[]=[];
  const runtime=new WorkspaceRuntime(root,m=>events.push(m),worker);
  try {
    await runtime.start(); assert.equal(runtime.status,'ready');
    const send=runtime.command({type:'agent',command:{type:'send',requestId:'sending',input:{content:'test'}}});
    const rejection=assert.rejects(send,/exited/);
    await new Promise<void>((resolve,reject)=>{
      const deadline=setTimeout(()=>reject(new Error('No token event')),2000);
      const timer=setInterval(()=>{if(runtime.snapshot.streamingText==='hello'){clearTimeout(deadline);clearInterval(timer);resolve();}},5);
    });
    assert.equal(runtime.snapshot.status,'running');
    assert.equal(await runtime.command({type:'agent',command:{type:'abort',requestId:'abort'}}),true);
    await rejection;
    assert.equal(runtime.status,'disconnected'); assert.equal(runtime.snapshot.status,'disconnected');
    assert.ok(events.some(m=>m.type==='agent_event' && m.event.type==='snapshot' && m.event.snapshot.streamingText==='hello'));
  } finally {await runtime.stop();await rm(root,{recursive:true,force:true});}
});

test('source development resolves built assets and worker relative to CLI package',()=>{
  assert.equal(defaultWebAssetsPath,fileURLToPath(new URL('../../dist/web',import.meta.url)));
  assert.equal(defaultWebWorkerPath,fileURLToPath(new URL('../../dist/web-worker.js',import.meta.url)));
});
