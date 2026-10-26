import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleGraph, layoutSlowDown, layoutDurationMs } from './graph-view.js';
const nodes = [
  { id:'a', path:'src/main.ts' }, { id:'b', path:'src/api/client.ts' },
  { id:'c', path:'src/components/view.tsx' }, { id:'d', path:'alone.ts' },
];
const edges = [{id:'ab',source:'a',target:'b'}, {id:'bc',source:'b',target:'c'}];
test('all scope preserves the complete scene when selected file changes', () => {
  for (const selected of ['a','c',null]) assert.deepEqual(visibleGraph(nodes,edges,selected,0,'all').nodes,nodes);
});
test('hop scopes follow incoming and outgoing relations without crossing the limit', () => {
  assert.deepEqual(visibleGraph(nodes,edges,'b',1,'all').nodes.map(n=>n.id),['a','b','c']);
  assert.deepEqual(visibleGraph(nodes,edges,'a',1,'all').nodes.map(n=>n.id),['a','b']);
  assert.deepEqual(visibleGraph(nodes,edges,'a',2,'all').nodes.map(n=>n.id),['a','b','c']);
  assert.deepEqual(visibleGraph(nodes,edges,'d',2,'all').nodes.map(n=>n.id),['d']);
});
test('path role filtering keeps only edges with two visible endpoints', () => {
  const result=visibleGraph(nodes,edges,null,0,'api');
  assert.deepEqual(result.nodes.map(n=>n.id),['b']); assert.deepEqual(result.edges,[]);
  assert.deepEqual(visibleGraph(nodes,edges,null,2,'all').nodes,nodes);
});

import { clusterGraph, revealFileClusters } from './graph-view.js';
import type { GraphNode } from '../../shared/ipc.js';
const files: GraphNode[] = ['packages/app/src/ui/a.tsx','packages/app/src/ui/b.tsx','packages/app/src/api/c.ts','packages/lib/a.ts','packages/lib/b.ts','README.md','LICENSE'].map(path=>({id:path,path,label:path.split('/').at(-1)!,inboundCount:0,outboundCount:0,category:'other'}));
const imports = [
  {id:'one',source:files[0].id,target:files[3].id,importKind:'import',isResolved:true},
  {id:'two',source:files[1].id,target:files[4].id,importKind:'import',isResolved:true},
  {id:'internal',source:files[0].id,target:files[1].id,importKind:'import',isResolved:true},
];
test('overview groups packages and root files, aggregating cross-cluster imports without self edges',()=>{
  const result=clusterGraph(files,imports,new Set());
  assert.deepEqual(result.nodes.map(node=>node.path).sort(),['.','packages/app','packages/lib']);
  assert.equal(result.nodes.find(node=>node.path==='packages/app')?.internalRelations,1);
  assert.equal(result.edges.length,1);assert.equal(result.edges[0].count,2);
  assert.equal(result.edges[0].source,'cluster:packages/app');
  assert.equal(result.edges[0].target,'cluster:packages/lib');
  assert.equal(result.nodes.flatMap(node=>'members' in node ? node.members : [node.id]).length,files.length);
});
test('expanding a package reveals submodules, while other packages stay collapsed',()=>{
  const result=clusterGraph(files,imports,new Set(['packages/app']));
  assert.ok(result.nodes.some(node=>node.path==='packages/app/src'));
  assert.ok(result.nodes.some(node=>node.path==='packages/lib' && 'members' in node));
});
test('revealing a file opens all ancestor clusters without dropping existing expansion',()=>{
  const expanded=revealFileClusters(new Set(['packages/lib']),files[0].path);
  const result=clusterGraph(files,imports,expanded);
  assert.ok(expanded.has('packages/lib'));
  assert.ok(!expanded.has('.'));

  assert.ok(result.nodes.some(node=>node.id===files[0].id));
  assert.ok(result.nodes.some(node=>node.id===files[1].id));
  assert.ok(!result.nodes.some(node=>'members' in node && !node.expanded && node.members?.includes(files[0].id)));
  assert.ok(clusterGraph(files,imports,revealFileClusters(new Set(),'README.md')).nodes.some(node=>node.id==='README.md'));
});
test('cluster output is deterministic with overlapping folder prefixes and isolated files',()=>{
  const all=[...files,{...files[0],id:'packages/application/a.ts',path:'packages/application/a.ts'}];
  const result=clusterGraph(all,imports,new Set());
  assert.ok(result.nodes.some(node=>node.path==='packages/application'));
  assert.deepEqual(clusterGraph([],[],new Set()),{nodes:[],edges:[]});
});

import { transitionPositions } from './graph-view.js';
test('expansion keeps existing nodes at their old position and spawns children from the removed parent',()=>{
  const parent={id:'cluster:packages/app',position:{x:200,y:100},data:{path:'packages/app',members:['a','b']}};
  const existing={id:'other',position:{x:700,y:300},data:{path:'packages/lib'}};
  const next=[{...existing,position:{x:800,y:400}}, {id:'a',position:{x:300,y:50},data:{path:'packages/app/src/a.ts'}}, {id:'cluster:packages/app/src/ui',position:{x:400,y:200},data:{path:'packages/app/src/ui',members:['b']}}];
  const starts=transitionPositions([parent,existing],next);
  assert.deepEqual(starts.get('other'),existing.position);
  assert.deepEqual(starts.get('a'),parent.position);
  assert.deepEqual(starts.get('cluster:packages/app/src/ui'),parent.position);
});
test('collapse enters the parent at the average of its former children; unrelated folders do not supply an origin',()=>{
  const previous=[{id:'a',position:{x:10,y:20},data:{path:'src/a.ts'}},{id:'b',position:{x:30,y:40},data:{path:'src/b.ts'}}];
  const next=[{id:'cluster:src',position:{x:500,y:600},data:{path:'src',members:['a','b']}},{id:'cluster:src-other',position:{x:100,y:200},data:{path:'src-other',members:['c']}}];
  const starts=transitionPositions(previous,next);
  assert.deepEqual(starts.get('cluster:src'),{x:20,y:30});
  assert.deepEqual(starts.get('cluster:src-other'),{x:100,y:200});
});

test('expanded folders retain their own anchor and connect immediate children separately from imports',()=>{
  const scene=clusterGraph(files,imports,new Set(['packages/app','packages/app/src']));
  assert.equal(scene.nodes.find(node=>node.id==='cluster:packages/app')?.expanded,true);
  assert.equal(scene.nodes.find(node=>node.id==='cluster:packages/app/src')?.expanded,true);
  assert.ok(scene.edges.some(edge=>edge.source==='cluster:packages/app' && edge.target==='cluster:packages/app/src' && edge.count===0));
  assert.ok(scene.edges.some(edge=>edge.source==='cluster:packages/app/src' && edge.target==='cluster:packages/app/src/ui' && edge.count===0));
  assert.equal(scene.nodes.find(node=>node.id==='cluster:packages/app')?.internalRelations,1);
  assert.equal(scene.edges.filter(edge=>edge.count>0).reduce((sum,edge)=>sum+edge.count,0),2);
});
test('collapsing a folder hides its descendants while preserving the ancestor and sibling folders',()=>{
  const expanded=new Set(['packages/app','packages/app/src','packages/app/src/ui']);
  expanded.delete('packages/app/src');
  const scene=clusterGraph(files,imports,expanded);
  assert.equal(scene.nodes.find(node=>node.id==='cluster:packages/app')?.expanded,true);
  assert.equal(scene.nodes.find(node=>node.id==='cluster:packages/app/src')?.expanded,false);
  assert.ok(!scene.nodes.some(node=>node.path.startsWith('packages/app/src/')));
  assert.ok(scene.nodes.some(node=>node.id==='cluster:packages/lib'));
  expanded.add('packages/app/src');
  assert.ok(clusterGraph(files,imports,expanded).nodes.some(node=>node.id===files[0].id));
});
test('new children animate from a retained folder anchor',()=>{
  const folder={id:'cluster:src',position:{x:10,y:20},data:{path:'src',members:['a']}};
  const next=[{...folder,position:{x:80,y:90}},{id:'a',position:{x:200,y:100},data:{path:'src/a.ts'}}];
  assert.deepEqual(transitionPositions([folder],next).get('a'),folder.position);
});

test('layout cooling ramps damping monotonically from a gentle start to a near-stop', () => {
  const duration = layoutDurationMs(1500);
  const samples = Array.from({ length: 21 }, (_, i) => layoutSlowDown(i * duration / 20, duration));
  assert.equal(samples[0], 2);
  assert.equal(samples.at(-1), 80);
  for (let i = 1; i < samples.length; i++) assert.ok(samples[i] >= samples[i - 1]);
  assert.equal(layoutSlowDown(duration * 2, duration), 80);
  assert.equal(layoutDurationMs(5000), 30000);
});
