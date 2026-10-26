import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { diffLines, createPatch } from 'diff';
import type { WebCommand, WorkingDiffFile } from '@codemap-ai/web/contracts';

const exec = promisify(execFile);
export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function contains(root: string, target: string) {
  const path = relative(root, target);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}
export async function resolveWorkspacePath(root: string, input: string, allowNew = false): Promise<string> {
  const canonicalRoot = await realpath(root);
  const requested = resolve(canonicalRoot, input);
  if (!contains(canonicalRoot, requested) || input.includes('\0')) throw new HttpError(403,'Path is outside the workspace');
  let ancestor = requested;
  for (;;) {
    try {
      const canonical = await realpath(ancestor);
      if (!contains(canonicalRoot, canonical)) throw new HttpError(403,'Symlink is outside the workspace');
      return resolve(canonical, relative(ancestor, requested));
    } catch (error) {
      if (error instanceof HttpError || !allowNew || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      if (ancestor === canonicalRoot) throw error;
      ancestor = dirname(ancestor);
    }
  }
}
const languages: Record<string,string> = {
  ts:'typescript',tsx:'typescript',mts:'typescript',cts:'typescript',js:'javascript',jsx:'javascript',mjs:'javascript',cjs:'javascript',json:'json',css:'css',scss:'scss',html:'html',md:'markdown',mdx:'markdown',py:'python',rb:'ruby',go:'go',rs:'rust',java:'java',c:'c',cpp:'cpp',cs:'csharp',sh:'shell',yaml:'yaml',yml:'yaml',sql:'sql',xml:'xml',svg:'xml',toml:'toml',
};
async function textFile(root: string, path: string) {
  const target = await resolveWorkspacePath(root,path);
  const info = await stat(target);
  if (!info.isFile()) throw new HttpError(400,'Path is not a file');
  if (info.size > 10 * 1024 * 1024) throw new HttpError(413,'File exceeds 10 MiB');
  const content = await readFile(target,'utf8');
  if (content.includes('\0')) throw new HttpError(415,'Binary file cannot be edited as text');
  return {content,language:languages[extname(path).slice(1)] ?? 'plaintext',lines:content.split('\n').length};
}
export async function fileCommand(root: string, command: WebCommand): Promise<unknown> {
  switch (command.type) {
    case 'read_file': return textFile(root,command.filePath);
    case 'read_file_preview': {
      const file = await textFile(root,command.filePath);
      return {...file,content:file.content.split('\n').slice(0,60).join('\n'),truncated:file.lines > 60};
    }
    case 'write_file': {
      const target = await resolveWorkspacePath(root,command.filePath,true);
      await mkdir(dirname(target),{recursive:true});
      // Recheck newly created parent directories before opening the destination.
      await resolveWorkspacePath(root,command.filePath,true);
      await writeFile(target,command.content,'utf8');
      return {success:true};
    }
    case 'stat_file': {
      const info = await stat(await resolveWorkspacePath(root,command.filePath));
      return {path:command.filePath,type:info.isDirectory()?'directory':'file',size:info.size,mtimeMs:info.mtimeMs};
    }
    case 'read_directory': case 'list_directory': {
      const target = await resolveWorkspacePath(root,command.dirPath);
      const entries = await readdir(target,{withFileTypes:true});
      const result: Array<{name:string,path:string,type:'file'|'directory'}> = [];
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const path = join(command.dirPath,entry.name);
        try {
          const safe = await resolveWorkspacePath(root,path);
          const info = await stat(safe);
          result.push({name:entry.name,path,type:info.isDirectory()?'directory':'file'});
        } catch { /* Broken or escaping symlinks are not workspace entries. */ }
      }
      return result.sort((a,b)=> a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1);
    }
    default: throw new HttpError(400,'Not a filesystem command');
  }
}
async function git(root: string, args: string[]) {
  return (await exec('git',args,{cwd:root,maxBuffer:20*1024*1024})).stdout;
}
export async function getBranchName(root: string) {
  return (await git(root,['symbolic-ref','--short','-q','HEAD']).catch(()=>git(root,['rev-parse','--short','HEAD']))).trim();
}
export async function getWorkingDiffFiles(root: string): Promise<WorkingDiffFile[]> {
  const raw = await git(root,['status','--porcelain=v1','-z','--untracked-files=all']);
  const entries = raw.split('\0');
  const files: WorkingDiffFile[] = [];
  for (let i=0; i<entries.length; i++) {
    const entry = entries[i]; if (!entry) continue;
    const state = entry.slice(0,2); const path = entry.slice(3);
    const renamed = state.includes('R');
    const oldPath = renamed || state.includes('C') ? entries[++i] : undefined;
    const status: WorkingDiffFile['status'] = renamed ? 'renamed' : state.includes('D') ? 'deleted' : state === '??' || state.includes('A') ? 'added' : 'modified';
    const original = status === 'added' ? '' : await git(root,['show',`HEAD:${oldPath ?? path}`]).catch(()=>'');
    const modified = status === 'deleted' ? '' : await textFile(root,path).then(f=>f.content).catch(error=> {
      if (error instanceof HttpError && error.status === 403) throw error;
      return '[Binary or unreadable file]';
    });
    let additions=0, deletions=0;
    for (const part of diffLines(original,modified)) {
      if (part.added) additions += part.count ?? 0;
      if (part.removed) deletions += part.count ?? 0;
    }
    files.push({path,...(oldPath?{oldPath}:{}),status,original,modified,additions,deletions});
  }
  return files;
}
export async function getWorkingDiff(root: string) {
  const files = await getWorkingDiffFiles(root);
  return files.map(file=>createPatch(file.path,file.original,file.modified,file.oldPath ?? file.path,file.path)).join('\n');
}
