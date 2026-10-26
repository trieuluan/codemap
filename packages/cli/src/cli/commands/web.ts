import { execFile } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startWebServer } from '../../web/server.js';

export function parseWebArgs(args:string[]) {
  let workspacePath=process.cwd(),port=4747,open=true,help=false,pathSet=false;
  for(let i=0;i<args.length;i++) {
    const arg=args[i]!;
    if(arg==='--') continue;
    if(arg==='--help' || arg==='-h'){help=true;continue;}
    if(arg==='--no-open'){open=false;continue;}
    if(arg==='--port' || arg.startsWith('--port=')) {
      const value=arg==='--port'?args[++i]:arg.slice('--port='.length);
      if(!value || !/^\d+$/.test(value) || Number(value)<1 || Number(value)>65535) throw new Error('--port must be an integer between 1 and 65535');
      port=Number(value);continue;
    }
    if(arg.startsWith('-')) throw new Error(`Unknown web option: ${arg}`);
    if(pathSet) throw new Error('Provide only one workspace path');
    workspacePath=arg;pathSet=true;
  }
  return {workspacePath,port,open,help};
}
export async function runWebCommand(args:string[]) {
  const options=parseWebArgs(args);
  if(options.help){console.log('Usage: codemap web [path] [--port 4747] [--no-open]\n\nStart the browser workspace on 127.0.0.1. Defaults to the current directory.');return;}
  const workspacePath=await realpath(resolve(options.workspacePath)).catch(()=>{throw new Error(`Workspace does not exist: ${options.workspacePath}`);});
  if(!(await stat(workspacePath)).isDirectory()) throw new Error(`Workspace is not a directory: ${options.workspacePath}`);
  const running=await startWebServer({workspacePath,port:options.port}).catch(error=>{
    if((error as NodeJS.ErrnoException).code==='EADDRINUSE') throw new Error(`Port ${options.port} is already in use. Choose another with --port.`);
    throw error;
  });
  console.log(`CodeMap Web: ${running.url}\nWorkspace: ${workspacePath}\nPress Ctrl+C to stop.`);
  if(options.open) {
    const command=process.platform==='darwin'?'open':process.platform==='win32'?'rundll32':'xdg-open';
    const argv=process.platform==='win32'?['url.dll,FileProtocolHandler',running.url]:[running.url];
    execFile(command,argv,error=>{if(error)console.error(`Could not open the browser. Open ${running.url} manually.`);});
  }
  let stopping=false;
  const shutdown=()=>{if(stopping)return;stopping=true;void running.close().then(()=>{process.removeListener('SIGINT',shutdown);process.removeListener('SIGTERM',shutdown);}).catch(error=>{console.error(error);process.exitCode=1;});};
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
