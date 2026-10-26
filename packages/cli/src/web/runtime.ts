import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createInitialSessionSnapshot, reduceAgentSessionEvent } from '@codemap-ai/core/agent/session';
import { runtimeMessageSchema, type RuntimeMessage, type UtilityCommand, type SettingsMetadata, type WebBootstrap } from '@codemap-ai/web/contracts';
import { RequestTracker } from './request-tracker.js';

export const defaultWebWorkerPath=fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'../../dist/web-worker.js':'./web-worker.js',import.meta.url));

export class WorkspaceRuntime {
  private child: ChildProcess | null = null;
  private pending = new RequestTracker();
  private ready: Promise<void> | null = null;
  private timers = new Map<string,ReturnType<typeof setTimeout>>();
  snapshot = createInitialSessionSnapshot();
  settings: SettingsMetadata | null = null;
  status: WebBootstrap['status'] = 'starting';
  index: NonNullable<WebBootstrap['index']> = {status:'indexing'};
  constructor(readonly workspacePath: string, private readonly emit: (message: RuntimeMessage)=>void, private readonly workerPath = defaultWebWorkerPath) {}
  start(): Promise<void> {
    if (this.ready) return this.ready;
    this.publish({type:'runtime_status',status:'starting'});
    const child = fork(this.workerPath,[],{cwd:this.workspacePath,execArgv:[],stdio:['ignore','pipe','pipe','ipc'],env:process.env});
    this.child=child;
    child.stdout?.on('data',data=>process.stdout.write(`[web runtime] ${data}`));
    child.stderr?.on('data',data=>process.stderr.write(`[web runtime] ${data}`));
    child.on('message',raw=>{
      if(this.child !== child) return;
      const parsed=runtimeMessageSchema.safeParse(raw);
      if(!parsed.success) return;
      const message=parsed.data;
      if(message.type==='request_result' || message.type==='request_error') {
        clearTimeout(this.timers.get(message.requestId)); this.timers.delete(message.requestId);
        if(message.type==='request_error') this.pending.reject(message.requestId,new Error(message.message));
        else this.pending.resolve(message.requestId,message.result);
      } else this.publish(message);
    });
    const lost=(error:Error)=> {
      if(this.child !== child) return;
      this.child=null; this.ready=null;
      this.cancelPending(error);
      this.snapshot={...this.snapshot,status:'disconnected',error:error.message};
      this.publish({type:'runtime_status',status:'disconnected',message:error.message});
      this.emit({type:'agent_event',event:{type:'snapshot',snapshot:this.snapshot}});
    };
    child.on('error',lost);
    child.on('exit',(code)=>lost(new Error(`Agent runtime exited (${code ?? 'signal'})`)));
    this.ready=this.request<void>({type:'initialize',requestId:crypto.randomUUID(),workspacePath:this.workspacePath}).catch(error=>{void this.stop();throw error;});
    return this.ready;
  }
  async command(command:UtilityCommand): Promise<unknown> {await this.start(); return this.request(command);}
  async restart() {await this.stop();this.snapshot=createInitialSessionSnapshot();this.emit({type:'agent_event',event:{type:'snapshot',snapshot:this.snapshot}});this.settings=null;await this.start();}
  private publish(message:RuntimeMessage) {
    if(message.type==='agent_event') this.snapshot=reduceAgentSessionEvent(this.snapshot,message.event);
    if(message.type==='ready') {this.settings=message.settings;this.status='ready';this.emit({type:'runtime_status',status:'ready'});}
    if(message.type==='runtime_status') this.status=message.status;
    if(message.type==='index_status') this.index=message.index;
    this.emit(message);
  }
  private cancelPending(error:Error) {for(const timer of this.timers.values()) clearTimeout(timer);this.timers.clear();this.pending.rejectAll(error);}
  private request<T>(command:UtilityCommand): Promise<T> {
    const child=this.child;
    if(!child?.connected) return Promise.reject(new Error('Agent runtime is disconnected'));
    const id=command.type==='agent'?command.command.requestId:command.requestId;
    if(this.timers.has(id)) return Promise.reject(new Error(`Duplicate request ID: ${id}`));
    const result=this.pending.add<T>(id);
    const timer=setTimeout(()=>{this.timers.delete(id);this.pending.reject(id,new Error('Runtime request timed out'));},command.type==='agent' && command.command.type==='send'?30*60_000:120_000);
    timer.unref();this.timers.set(id,timer);
    child.send(command,error=>{if(error){clearTimeout(timer);this.timers.delete(id);this.pending.reject(id,error);}});
    return result;
  }
  async stop() {
    const child=this.child;this.child=null;this.ready=null;
    this.cancelPending(new Error('Agent runtime stopped'));
    this.publish({type:'runtime_status',status:'disconnected'});
    if(!child) return;
    await new Promise<void>(resolve=>{
      if(child.exitCode !== null || child.signalCode !== null){resolve();return;}
      const timeout=setTimeout(()=>{child.kill('SIGKILL');resolve();},5_000);
      child.once('exit',()=>{clearTimeout(timeout);resolve();});child.kill('SIGTERM');
    });
  }
}
