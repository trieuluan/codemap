import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebSessionState } from './session-state.js';
import { createInitialSessionSnapshot, reduceAgentSessionEvent } from '@codemap-ai/core/agent/session';

test('web snapshots retain two turns, active thread and pending approvals without concatenating replies',()=>{
  let threadId:string|null=null;
  const state=createWebSessionState(()=>{},()=>threadId);
  state.begin({requestId:'one',content:'first question'});
  state.receive({type:'status',status:'running',requestId:'one'});
  threadId='actual-harness-thread';
  state.receive({type:'token',text:'first answer',requestId:'one'});
  assert.equal(state.snapshot.threadId,threadId);
  assert.equal(state.snapshot.messages[0]?.content,'first question');
  state.receive({type:'status',status:'idle',requestId:'one'});
  state.finish();
  assert.deepEqual(state.snapshot.messages.map(m=>m.content),['first question','first answer']);
  assert.equal(state.snapshot.streamingText,'');
  state.begin({requestId:'two',content:'second question'});
  state.receive({type:'status',status:'running',requestId:'two'});
  state.receive({type:'token',text:'second answer',requestId:'two'});
  state.receive({type:'approval',requestId:'two',approval:{approvalId:'approve-write',toolCallId:'write',toolName:'write_file',args:{path:'entry.ts'}}});
  const reconnect=structuredClone(state.snapshot);
  assert.equal(reconnect.streamingText,'second answer');
  assert.equal(reconnect.pendingApproval?.approvalId,'approve-write');
  assert.equal(reconnect.threadId,'actual-harness-thread');
  assert.deepEqual(reconnect.messages.map(m=>m.content),['first question','first answer','second question']);
  state.receive({type:'approval_resolved',requestId:'approval',approvalId:'approve-write'});
  state.receive({type:'status',status:'idle',requestId:'two'});
  assert.deepEqual(state.snapshot.messages.map(m=>m.content),['first question','first answer','second question','second answer']);
  assert.equal(state.snapshot.pendingApproval,null);
});

test('interleaved text, reasoning and tools retain chronological order after completion and reconnect',()=>{
  const state=createWebSessionState(()=>{},()=> 'thread');
  state.begin({requestId:'turn',content:'question'});
  state.receive({type:'status',requestId:'turn',status:'running'});
  state.receive({type:'thinking',requestId:'turn',text:'Reason before tool'});
  state.receive({type:'token',requestId:'turn',text:'Before tool'});
  state.receive({type:'tool_start',requestId:'turn',toolCallId:'call',name:'read_file',args:'{}'});
  state.receive({type:'tool_result',requestId:'turn',toolCallId:'call',result:'old result',isError:false});
  state.receive({type:'tool_result',requestId:'turn',toolCallId:'call',result:'updated result',isError:false});
  state.receive({type:'thinking',requestId:'turn',text:'Reason after tool'});
  state.receive({type:'token',requestId:'turn',text:'After tool'});
  state.receive({type:'status',requestId:'turn',status:'idle'});
  assert.deepEqual(state.snapshot.messages.map(message=>[message.role,message.content]),[
    ['user','question'],
    ['assistant',[{type:'thinking',thinking:'Reason before tool'}]],
    ['assistant','Before tool'],
    ['tool_call','{}'],
    ['tool','updated result'],
    ['assistant',[{type:'thinking',thinking:'Reason after tool'}]],
    ['assistant','After tool'],
  ]);
  assert.equal(state.snapshot.streamingText,'');
  assert.equal(state.snapshot.thinkingText,'');
  assert.equal(state.snapshot.messages.filter(message=>message.role==='tool').length,1);
});

test('thread mutation and second prompt remain blocked until the pending send settles',()=>{
  const state=createWebSessionState(()=>{},()=> 'thread');
  state.begin({requestId:'first',content:'first prompt'});
  state.receive({type:'status',requestId:'first',status:'running'});
  assert.throws(()=>state.assertCanChangeThread(),/running/);
  state.receive({type:'status',requestId:'first',status:'idle'});
  assert.throws(()=>state.assertCanChangeThread(),/running/);
  assert.throws(()=>state.begin({requestId:'phantom',content:'phantom prompt'}),/running/);
  assert.equal(state.snapshot.messages.length,1);
  state.finish();
  state.assertCanChangeThread();
  state.begin({requestId:'second',content:'accepted prompt'});
  assert.deepEqual(state.snapshot.messages.map(message=>message.content),['first prompt','accepted prompt']);
});

test('emitted events preserve the authoritative mid-turn snapshot across text and tool boundaries',()=>{
  let reconnect=createInitialSessionSnapshot();
  const state=createWebSessionState(event=>{reconnect=reduceAgentSessionEvent(reconnect,event);},()=> 'thread');
  state.begin({requestId:'turn',content:'question'});
  state.receive({type:'status',requestId:'turn',status:'running'});
  state.receive({type:'thinking',requestId:'turn',text:'reasoning'});
  state.receive({type:'token',requestId:'turn',text:'before tool'});
  assert.deepEqual(reconnect,state.snapshot);
  state.receive({type:'tool_start',requestId:'turn',toolCallId:'call',name:'read_file',args:'{}'});
  assert.deepEqual(reconnect,state.snapshot);
  state.receive({type:'tool_result',requestId:'turn',toolCallId:'call',result:'result',isError:false});
  state.receive({type:'token',requestId:'turn',text:'after tool'});
  assert.deepEqual(reconnect,state.snapshot);
  state.receive({type:'thinking',requestId:'turn',text:'more reasoning'});
  assert.deepEqual(reconnect,state.snapshot);
});
