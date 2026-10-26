import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createInitialSessionSnapshot } from '@codemap-ai/core/agent/session';
import { redactSettingsMetadata, webCommandSchema, type RuntimeMessage, type WebBootstrap, type WebCommand, type UtilityCommand } from '@codemap-ai/web/contracts';
import { WorkspaceRuntime } from './runtime.js';
import { fileCommand, getBranchName, getWorkingDiff, getWorkingDiffFiles, HttpError, resolveWorkspacePath } from './files.js';

export interface WebServerOptions {workspacePath:string;port?:number;assetsPath?:string;workerPath?:string;runtime?:false;index?:false;}
export const defaultWebAssetsPath=fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'../../dist/web':'./web',import.meta.url));
const contentTypes:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff':'font/woff','.woff2':'font/woff2','.wasm':'application/wasm','.mp4':'video/mp4','.webm':'video/webm'};
export async function startWebServer(options:WebServerOptions) {
  const workspacePath=await realpath(options.workspacePath);
  if(!(await stat(workspacePath)).isDirectory()) throw new Error('Workspace path must be a directory');
  const assetsPath=await realpath(options.assetsPath ?? defaultWebAssetsPath);
  const token=randomBytes(32).toString('hex');
  const clients=new Set<ServerResponse>();
  let url='';let closing=false;
  const broadcast=(message:RuntimeMessage)=>{
    const chunk=`data: ${JSON.stringify(message)}\n\n`;
    for(const client of clients) {if(client.writableLength>2*1024*1024){client.destroy();clients.delete(client);}else client.write(chunk);}
  };
  const runtime=options.runtime===false?null:new WorkspaceRuntime(workspacePath,broadcast,options.workerPath);
  const bootstrap=():WebBootstrap=>({workspacePath,status:runtime?.status ?? 'ready',settings:runtime?.settings ?? redactSettingsMetadata({}),snapshot:runtime?.snapshot ?? createInitialSessionSnapshot(),index:runtime?.index ?? {status:'ready'}});
  function authorizeOrigin(req:IncomingMessage) {
    if(req.headers.host!==new URL(url).host) throw new HttpError(403,'Invalid Host');
    const origin=req.headers.origin;
    if(origin && origin!==url) throw new HttpError(403,'Invalid Origin');
    const fetchSite=req.headers['sec-fetch-site'];
    if(fetchSite && fetchSite!=='same-origin' && fetchSite!=='none') throw new HttpError(403,'Cross-site request rejected');
  }
  function hasCookie(req:IncomingMessage) {
    const name=`codemap_session_${new URL(url).port}=`;
    const value=(req.headers.cookie ?? '').split(';').map(item=>item.trim()).find(item=>item.startsWith(name))?.slice(name.length) ?? '';
    return /^[a-f0-9]{64}$/.test(value) && timingSafeEqual(Buffer.from(value),Buffer.from(token));
  }
  function json(res:ServerResponse,status:number,data:unknown) {res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));}
  async function command(command:WebCommand):Promise<unknown> {
    if(['read_file','read_file_preview','write_file','stat_file','read_directory','list_directory'].includes(command.type)) return fileCommand(workspacePath,command);
    switch(command.type) {
      case 'get_branch_name': return getBranchName(workspacePath).catch(()=>'');
      case 'get_working_diff': return getWorkingDiff(workspacePath);
      case 'get_working_diff_files': return getWorkingDiffFiles(workspacePath);
      case 'restart_runtime': if(!runtime) return; await runtime.restart();return;
      default: {
        if(!runtime) throw new HttpError(503,'Runtime disabled');
        return runtime.command(command as UtilityCommand);
      }
    }
  }
  const server=createServer((req,res)=>{void (async()=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    res.setHeader('Referrer-Policy','same-origin');
    authorizeOrigin(req);
    const path=new URL(req.url ?? '/',url).pathname;
    if(path==='/api/bootstrap' && req.method==='GET') {
      if(!hasCookie(req)) res.setHeader('set-cookie',`codemap_session_${new URL(url).port}=${token}; HttpOnly; SameSite=Strict; Path=/`);
      json(res,200,bootstrap());return;
    }
    if(path.startsWith('/api/')) {
      if(!hasCookie(req)) throw new HttpError(401,'Open CodeMap in this browser first');
      if(path==='/api/events' && req.method==='GET') {
        res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache, no-transform',connection:'keep-alive','X-Accel-Buffering':'no'});
        clients.add(res);
        const current=bootstrap();
        res.write(`data: ${JSON.stringify({type:'runtime_status',status:current.status})}\n\ndata: ${JSON.stringify({type:'agent_event',event:{type:'snapshot',snapshot:current.snapshot}})}\n\ndata: ${JSON.stringify({type:'index_status',index:current.index})}\n\n`);
        const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),15_000);heartbeat.unref();
        res.on('close',()=>{clearInterval(heartbeat);clients.delete(res);});return;
      }
      if(path==='/api/command' && req.method==='POST') {
        if(!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415,'Expected application/json');
        const chunks:Buffer[]=[];let size=0;
        for await(const chunk of req) {size+=Buffer.byteLength(chunk);if(size>20*1024*1024)throw new HttpError(413,'Request exceeds 20 MiB');chunks.push(Buffer.from(chunk));}
        let raw:unknown;
        try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(400,'Invalid JSON');}
        const parsed=webCommandSchema.safeParse(raw);
        if(!parsed.success) throw new HttpError(400,'Invalid command');
        json(res,200,{result:await command(parsed.data)});return;
      }
      throw new HttpError(404,'API route not found');
    }
    if(req.method!=='GET' && req.method!=='HEAD') throw new HttpError(405,'Method not allowed');
    let requested:string;
    try {requested=decodeURIComponent(path).slice(1);}catch{throw new HttpError(400,'Invalid URL');}
    if(!requested) requested='index.html';
    let target=await resolveWorkspacePath(assetsPath,requested).catch(error=>{
      if(error instanceof HttpError) throw error;
      if((error as NodeJS.ErrnoException).code==='ENOENT') throw new HttpError(404,'Asset not found');throw error;
    });
    if((await stat(target)).isDirectory()) target=await resolveWorkspacePath(assetsPath,join(requested,'index.html'));
    const body=await readFile(target);
    if(extname(target)==='.html' && !hasCookie(req)) res.setHeader('set-cookie',`codemap_session_${new URL(url).port}=${token}; HttpOnly; SameSite=Strict; Path=/`);
    res.writeHead(200,{'content-type':contentTypes[extname(target)] ?? 'application/octet-stream','cache-control':extname(target)==='.html'?'no-cache':'public, max-age=3600','content-length':body.length});
    res.end(req.method==='HEAD'?undefined:body);
  })().catch(error=>{
    if(res.headersSent){res.destroy();return;}
    const status=error instanceof HttpError?error.status:(error as NodeJS.ErrnoException).code==='ENOENT'?404:500;
    json(res,status,{error:error instanceof Error?error.message:String(error)});
  });});
  await new Promise<void>((resolve,reject)=>{
    server.once('error',reject);server.listen(options.port ?? 4747,'127.0.0.1',()=>{server.off('error',reject);resolve();});
  });
  const address=server.address();if(!address || typeof address==='string') throw new Error('No server address');
  url=`http://127.0.0.1:${address.port}`;
  if(runtime) void runtime.start().catch(error=>console.error(`Web runtime: ${error instanceof Error?error.message:String(error)}`));
  return {url,server,async close(){if(closing)return;closing=true;for(const client of clients)client.end();clients.clear();await runtime?.stop();await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});}};
}
