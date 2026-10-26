import { graphRole } from './graph-role.js';
export type GraphFilters = { depth: 0 | 1 | 2 | 3; role: string; hiddenModules: string[]; hiddenKinds: string[]; hiddenNodeTypes: string[] };
export const defaultGraphFilters: GraphFilters = { depth: 0, role: 'all', hiddenModules: [], hiddenKinds: [], hiddenNodeTypes: [] };

// A node's "module" is its first two directory segments (or the top-level dir / "." for root
// files). Same module → same color, so clusters read as one hue and can be toggled together.
const MODULE_PALETTE = ['#e06c75', '#e5a66a', '#e6d06a', '#a8d16a', '#6ad1a0', '#6ad1cf', '#6ab4e0', '#6a86e0', '#a06ae0', '#d16ad1', '#e06aa0', '#c2946a', '#8fae6a', '#6a9fd1', '#d1b86a', '#6ad17f'];
export function moduleKeyOf(path: string): string {
  const parts = path.replaceAll('\\', '/').split('/');
  return parts.slice(0, -1).slice(0, 2).join('/') || '.';
}
export function moduleColor(path: string): string {
  const key = moduleKeyOf(path);
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return MODULE_PALETTE[hash % MODULE_PALETTE.length];
}
// Live layout cooling: ForceAtlas2 runs for a fixed time while its damping (slowDown) ramps up
// quadratically, so nodes flow fast at first, then settle and stop. Measured on a 1.5k-node graph:
// per-frame motion decays smoothly to ~0 with no back-and-forth jitter, unlike a constant slowDown
// that keeps oscillating.
export function layoutDurationMs(nodeCount: number): number {
  return nodeCount > 3000 ? 30000 : 20000;
}
export function layoutSlowDown(elapsedMs: number, durationMs: number): number {
  const progress = Math.min(1, Math.max(0, elapsedMs / durationMs));
  return 2 + 78 * progress * progress;
}

// Node colours follow the node type (like GitNexus), not the folder.
export const NODE_TYPE_META: Record<string, { label: string; color: string }> = {
  folder: { label: 'Folder', color: '#7c6cf0' },
  file: { label: 'File', color: '#4f8ff7' },
  class: { label: 'Class', color: '#f0b43c' },
  function: { label: 'Function', color: '#2fc48c' },
  method: { label: 'Method', color: '#2fb8c4' },
  interface: { label: 'Interface', color: '#e06c9a' },
  component: { label: 'Component', color: '#6ab4e0' },
  type_alias: { label: 'Type', color: '#c2946a' },
  variable: { label: 'Variable', color: '#9aa3b2' },
};
export function nodeTypeMeta(type: string) {
  return NODE_TYPE_META[type] ?? { label: type, color: '#9aa3b2' };
}
// Edge presentation. "contains" links a folder hub to its children (added by the graph view),
// "defines" links a file/symbol to its symbols; the index has no call data, so no Calls edges.
export const EDGE_KIND_META: Record<string, { label: string; color: string }> = {
  contains: { label: 'Contains', color: '#5f9a76' },
  defines: { label: 'Defines', color: '#3aa5a0' },
  import: { label: 'Import', color: '#4f8ff7' },
  dynamic_import: { label: 'Dynamic import', color: '#a06ae0' },
  export_from: { label: 'Re-export', color: '#d6b85a' },
  require: { label: 'Require', color: '#c2946a' },
  extends: { label: 'Extends', color: '#f0803c' },
  implements: { label: 'Implements', color: '#e05a6a' },
};
export function edgeKindMeta(kind: string) {
  return EDGE_KIND_META[kind] ?? { label: kind, color: '#929aa8' };
}

export function visibleGraph<N extends { id: string; path: string }, E extends { source: string; target: string }>(
  nodes: N[], edges: E[], selected: string | null, depth: GraphFilters['depth'], role: string,
) {
  let visible: Set<string> | null = null;
  if (selected && depth) {
    visible = new Set([selected]);
    let frontier = new Set([selected]);
    for (let hop = 0; hop < depth; hop++) {
      const next = new Set<string>();
      for (const edge of edges) {
        if (frontier.has(edge.source)) next.add(edge.target);
        if (frontier.has(edge.target)) next.add(edge.source);
      }
      for (const id of next) visible.add(id);
      frontier = next;
    }
  }
  const filtered = nodes.filter(node => (!visible || visible.has(node.id)) && (role === 'all' || graphRole(node.path).id === role));
  const ids = new Set(filtered.map(node => node.id));
  return { nodes: filtered, edges: edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
}

import type { GraphNode, GraphEdge } from '../../shared/ipc.js';
export type ClusterGraphNode = GraphNode & { members?: string[]; internalRelations?: number; expanded?: boolean };
export type ClusterGraphEdge = GraphEdge & { count: number };

export function revealFileClusters(expanded: Set<string>, path: string) {
  const next = new Set(expanded);
  if (!path.includes('/')) next.add('.');
  const parts = path.split('/');
  for (let length = 1; length < parts.length; length++) next.add(parts.slice(0, length).join('/'));
  return next;
}

export function clusterGraph(files: GraphNode[], imports: GraphEdge[], expanded: Set<string>) {
  const nodes: ClusterGraphNode[] = [];
  const representative = new Map<string,string>();
  const containment: ClusterGraphEdge[] = [];
  const addGroup = (path: string, members: GraphNode[]) => {
    const id = `cluster:${path}`;
    nodes.push({id,path,label:path === '.' ? 'Root files' : path.split('/').at(-1)!,members:members.map(node=>node.id),expanded:expanded.has(path),category:'other',inboundCount:0,outboundCount:0});
    const connectChild = (childId: string) => containment.push({id:`contains:${JSON.stringify([id,childId])}`,source:id,target:childId,count:0,importKind:'contains',isResolved:true});
    if (!expanded.has(path)) {
      for (const node of members) representative.set(node.id,id);
      return;
    }
    const children = new Map<string,GraphNode[]>();
    for (const node of members) {
      const relative = path === '.' ? node.path : node.path.slice(path.length + 1);
      const slash = relative.indexOf('/');
      if (slash < 0) { nodes.push(node); representative.set(node.id,node.id); connectChild(node.id); }
      else {
        const child = path === '.' ? relative.slice(0,slash) : `${path}/${relative.slice(0,slash)}`;
        const bucket = children.get(child) ?? []; bucket.push(node); children.set(child,bucket);
      }
    }
    for (const [child,bucket] of [...children].sort(([a],[b])=>a.localeCompare(b))) { connectChild(`cluster:${child}`); addGroup(child,bucket); }
  };
  const roots = new Map<string,GraphNode[]>();
  for (const node of files) {
    const parts=node.path.split('/');
    const key=parts.length === 1 ? '.' : /^(packages|apps|libs|services)$/.test(parts[0]) && parts.length > 2 ? parts.slice(0,2).join('/') : parts[0];
    const bucket=roots.get(key) ?? [];bucket.push(node);roots.set(key,bucket);
  }
  for (const [path,members] of [...roots].sort(([a],[b])=>a.localeCompare(b))) addGroup(path,members);
  const edges = new Map<string,ClusterGraphEdge>();
  const visibleNodes = new Map(nodes.map(node=>[node.id,node]));
  for (const edge of imports) {
    const source=representative.get(edge.source),target=representative.get(edge.target);
    if (!source || !target) continue;
    if (source === target) {
      const group=visibleNodes.get(source);
      if (group?.members) group.internalRelations=(group.internalRelations ?? 0)+1;
      continue;
    }
    const key=JSON.stringify([source,target]);
    const existing=edges.get(key);
    if (existing) existing.count++;
    else edges.set(key,{...edge,id:`link:${key}`,source,target,count:1});
  }
  for (const node of nodes) {
    if (!node.expanded || !node.members) continue;
    const members = new Set(node.members);
    node.internalRelations = imports.filter(edge => members.has(edge.source) && members.has(edge.target)).length;
  }
  return { nodes, edges:[...edges.values(), ...containment] };
}

type MovingNode = { id: string; position: { x: number; y: number }; data: { path?: unknown; members?: unknown } };
export function transitionPositions(previous: MovingNode[], next: MovingNode[]) {
  const previousById = new Map(previous.map(node => [node.id, node]));
  const nextIds = new Set(next.map(node => node.id));
  const removed = previous.filter(node => !nextIds.has(node.id));
  return new Map(next.map(node => {
    const existing = previousById.get(node.id);
    if (existing) return [node.id, existing.position];
    const path = String(node.data.path ?? '');
    const parent = previous.filter(old => Array.isArray(old.data.members) &&
      (old.data.members.includes(node.id) || path.startsWith(`${String(old.data.path)}/`)))
      .sort((a,b) => String(b.data.path).length - String(a.data.path).length)[0];
    if (parent) return [node.id, parent.position];
    const members = node.data.members;
    const children = Array.isArray(members) ? removed.filter(old => members.includes(old.id) ||
      (Array.isArray(old.data.members) && old.data.members.some(id => members.includes(id)))) : [];
    if (children.length) return [node.id, { x: children.reduce((sum, child) => sum + child.position.x, 0) / children.length, y: children.reduce((sum, child) => sum + child.position.y, 0) / children.length }];
    return [node.id, node.position];
  }));
}
