import type { GraphSymbolEdge, GraphSymbolNode, LocalGraphEdge } from "./builder.js";

export interface LocalGraphSymbol {
	filePath: string;
	localKey: string;
	displayName: string;
	kind: string;
	parentLocalKey: string | null;
	isExported: boolean;
	line: number | null;
	signature: string | null;
}

// A file whose symbols are mostly 1–2 character names is minified/bundled output; its symbols are
// noise in a code map (e.g. Monaco language workers), so they are dropped wholesale.
const MINIFIED_MIN_SYMBOLS = 10;
const MINIFIED_SHORT_NAME_RATIO = 0.4;

function isMinified(symbols: LocalGraphSymbol[]): boolean {
	if (symbols.length < MINIFIED_MIN_SYMBOLS) return false;
	return symbols.filter((symbol) => symbol.displayName.length <= 2).length / symbols.length >= MINIFIED_SHORT_NAME_RATIO;
}

const symbolId = (localKey: string) => `sym:${localKey}`;

/**
 * Symbol layer for the dependency graph: one node per class/function/method/…, `defines` edges
 * from a file (or a parent symbol) to its symbols, and `extends`/`implements` edges resolved by
 * name from the declaration signature — same file first, then files it imports, then a name
 * that is unique across the repo. The index has no call data, so there are no `calls` edges.
 */
export function buildSymbolGraph(
	symbols: LocalGraphSymbol[],
	fileIds: Set<string>,
	importEdges: LocalGraphEdge[],
): { symbols: GraphSymbolNode[]; symbolEdges: GraphSymbolEdge[] } {
	const byFile = new Map<string, LocalGraphSymbol[]>();
	for (const symbol of symbols) {
		if (!fileIds.has(symbol.filePath)) continue;
		const bucket = byFile.get(symbol.filePath);
		if (bucket) bucket.push(symbol);
		else byFile.set(symbol.filePath, [symbol]);
	}

	const kept: LocalGraphSymbol[] = [];
	for (const fileSymbols of byFile.values()) if (!isMinified(fileSymbols)) kept.push(...fileSymbols);
	const keptKeys = new Set(kept.map((symbol) => symbol.localKey));

	const nodes: GraphSymbolNode[] = kept.map((symbol) => ({
		id: symbolId(symbol.localKey),
		filePath: symbol.filePath,
		name: symbol.displayName,
		kind: symbol.kind,
		isExported: symbol.isExported,
		...(symbol.line != null ? { line: symbol.line } : {}),
	}));

	const edges: GraphSymbolEdge[] = [];
	for (const symbol of kept) {
		const parent = symbol.parentLocalKey && keptKeys.has(symbol.parentLocalKey) ? symbolId(symbol.parentLocalKey) : symbol.filePath;
		edges.push({ id: `defines:${symbol.localKey}`, source: parent, target: symbolId(symbol.localKey), kind: "defines" });
	}

	const byName = new Map<string, LocalGraphSymbol[]>();
	for (const symbol of kept) {
		const bucket = byName.get(symbol.displayName);
		if (bucket) bucket.push(symbol);
		else byName.set(symbol.displayName, [symbol]);
	}
	const importsOf = new Map<string, Set<string>>();
	for (const edge of importEdges) {
		const targets = importsOf.get(edge.sourceFileId);
		if (targets) targets.add(edge.targetFileId);
		else importsOf.set(edge.sourceFileId, new Set([edge.targetFileId]));
	}
	const resolve = (from: LocalGraphSymbol, name: string): LocalGraphSymbol | undefined => {
		const candidates = (byName.get(name) ?? []).filter((candidate) => candidate.localKey !== from.localKey);
		const sameFile = candidates.filter((candidate) => candidate.filePath === from.filePath);
		if (sameFile.length === 1) return sameFile[0];
		const imported = importsOf.get(from.filePath);
		const viaImport = imported ? candidates.filter((candidate) => imported.has(candidate.filePath)) : [];
		if (viaImport.length === 1) return viaImport[0];
		return candidates.length === 1 ? candidates[0] : undefined;
	};
	for (const symbol of kept) {
		if (!symbol.signature) continue;
		for (const kind of ["extends", "implements"] as const) {
			const match = symbol.signature.match(new RegExp(`\\b${kind}\\s+([A-Za-z_$][\\w$]*)`));
			const target = match ? resolve(symbol, match[1]) : undefined;
			if (target) edges.push({ id: `${kind}:${symbol.localKey}`, source: symbolId(symbol.localKey), target: symbolId(target.localKey), kind });
		}
	}

	return { symbols: nodes, symbolEdges: edges };
}
