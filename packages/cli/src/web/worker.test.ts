import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeMessageSchema, type RuntimeMessage } from '@codemap-ai/web/contracts';

test('real worker builds local graph before any model or MCP initialization', {timeout:30_000}, async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'codemap-worker-test-')));
  await writeFile(join(root,'entry.ts'),"import { value } from './value.js';\nconsole.log(value);\n");
  await writeFile(join(root,'value.ts'),'export const value = 42;\n');
  const child=fork(fileURLToPath(new URL('./worker.ts',import.meta.url)),[],{cwd:root,execArgv:['--import',import.meta.resolve('tsx')],stdio:['ignore','pipe','pipe','ipc']});
  let output='';child.stdout?.on('data',data=>{output+=String(data);});child.stderr?.on('data',data=>{output+=String(data);});
  const messages:RuntimeMessage[]=[];
  let graphData:unknown;
  const result=new Promise<unknown>((resolve,reject)=>{
    child.on('error',reject);child.on('exit',code=>reject(new Error(`Worker exited ${code}: ${output}`)));
    child.on('message',raw=>{
      const message=runtimeMessageSchema.parse(raw);messages.push(message);
      if(message.type==='ready') {child.send({type:'disable_auto_indexing',requestId:'disable'});child.send({type:'get_graph_data',requestId:'graph'});}
      if(message.type==='request_error') reject(new Error(message.message));
      if(message.type==='request_result' && message.requestId==='graph') {graphData=message.result;child.send({type:'get_auto_index_status',requestId:'index-status'});}
      if(message.type==='request_result' && message.requestId==='index-status') {assert.equal((message.result as {isActive:boolean}).isActive,false);resolve(graphData);}
    });
  });
  try {
    child.send({type:'initialize',requestId:'init',workspacePath:root});
    const graph=await result as {nodes:Array<{path:string}>;error?:string};
    assert.equal(graph.error,undefined,output);
    assert.ok(graph.nodes.some(node=>node.path==='entry.ts'));
    assert.ok(messages.some(m=>m.type==='index_status' && m.index.status==='ready'));
    assert.ok(!messages.some(m=>m.type==='agent_event'));
  } finally {
    const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));
    child.kill('SIGTERM');
    const killTimer=setTimeout(()=>child.kill('SIGKILL'),3000);
    await exited;clearTimeout(killTimer);
    await rm(root,{recursive:true,force:true});
  }
});
