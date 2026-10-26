import { createInitialSessionSnapshot, reduceAgentSessionEvent } from '@codemap-ai/core/agent/session';
import type { AgentSessionEvent, SendMessageInput, SessionMessage } from '@codemap-ai/core/agent/contracts';

export function createWebSessionState(emit:(event:AgentSessionEvent)=>void,currentThreadId:()=>string|null|undefined) {
  let snapshot=createInitialSessionSnapshot();
  let sending=false;
  function publish(){emit({type:'snapshot',snapshot});}
  function assertCanChangeThread() {
    if(sending) throw new Error('Wait for the running agent request to finish or abort it first');
  }
  function flush(kind:'text'|'thinking'|'both'='both') {
    if (!(kind!=='text' && snapshot.thinkingText) && !(kind!=='thinking' && snapshot.streamingText)) return false;
    const messages:SessionMessage[]=[...snapshot.messages];
    if(kind!=='text' && snapshot.thinkingText) messages.push({role:'assistant',content:[{type:'thinking',thinking:snapshot.thinkingText}]});
    if(kind!=='thinking' && snapshot.streamingText) messages.push({role:'assistant',content:snapshot.streamingText,createdAt:new Date().toISOString()});
    snapshot={...snapshot,messages,...(kind!=='text'?{thinkingText:''}:{}),...(kind!=='thinking'?{streamingText:''}:{})};
    return true;
  }
  function recordTool(event:Extract<AgentSessionEvent,{type:'tool_start'|'tool_result'}>) {
    const messages=[...snapshot.messages];
    const role=event.type==='tool_start'?'tool_call':'tool';
    const existing=messages.findIndex(message=>message.role===role && message.toolCallId===event.toolCallId);
    const tool=snapshot.tools.find(tool=>tool.toolCallId===event.toolCallId);
    const message:SessionMessage={role,toolCallId:event.toolCallId,name:event.type==='tool_start'?event.name:tool?.name,content:event.type==='tool_start'?event.args:event.result};
    if(existing!==-1) messages[existing]=message;
    else if(role==='tool') {
      const call=messages.findIndex(message=>message.role==='tool_call' && message.toolCallId===event.toolCallId);
      messages.splice(call===-1?messages.length:call+1,0,message);
    } else messages.push(message);
    snapshot={...snapshot,messages};
  }
  return {
    get snapshot(){return snapshot;},
    assertCanChangeThread,
    finish(){sending=false;},
    begin(input:SendMessageInput) {
      assertCanChangeThread();
      if(snapshot.status==='running' || snapshot.status==='aborting') throw new Error('Agent session is already running');
      sending=true;
      const images=(input.images ?? []).map(image=>`\n![${image.filename ?? 'image'}](data:${image.mimeType};base64,${image.data})`).join('');
      snapshot={...snapshot,messages:[...snapshot.messages,{id:input.requestId,role:'user',content:input.content+images,createdAt:new Date().toISOString()}],streamingText:'',thinkingText:'',tools:[],pendingApproval:null,pendingQuestion:null,pendingPlanReview:null,error:null};
      publish();
    },
    receive(event:AgentSessionEvent) {
      const previousThread=snapshot.threadId;
      let historyChanged=false;
      if(event.type==='token') historyChanged=flush('thinking');
      if(event.type==='thinking') historyChanged=flush('text');
      if(event.type==='tool_start' || event.type==='tool_result') {flush();historyChanged=true;}
      snapshot=reduceAgentSessionEvent(snapshot,event);
      snapshot={...snapshot,threadId:currentThreadId() ?? snapshot.threadId};
      if(event.type==='tool_start' || event.type==='tool_result') recordTool(event);
      if((event.type==='status' && event.status==='idle') || event.type==='error') {
        flush();
        snapshot={...snapshot,tools:[],pendingApproval:null,pendingQuestion:null,pendingPlanReview:null};
        emit(event);publish();return;
      }
      if(historyChanged || previousThread!==snapshot.threadId || event.type==='snapshot') publish();
      else emit(event);
    },
  };
}
