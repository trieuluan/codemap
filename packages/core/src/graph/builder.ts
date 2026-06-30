import { tarjanSCC, toTopLevelFolder, toPathBaseName, buildEntryLikeReason } from "./utils.js";

// ---- Input types ----

export interface LocalGraphFile {
	id: string;
	path: string;
	language: string | null;
	isParseable: boolean;
}

export interface LocalGraphEdge {
	sourceFileId: string;
	targetFileId: string;
	importKind: string;
	isResolved: boolean;
	resolutionKind: string;
}

// ---- Output types matching desktop GraphData (ipc.ts) ----

export interface GraphNode {
	id: string;
	label: string;
	path: string;
	language?: string;
	dirPath?: string;
	isInCycle?: boolean;
	inboundCount: number;
	outboundCount: number;
	category: "entry" | "core" | "shared" | "other";
}

export interface GraphEdge {
	id: string;
	source: string;
	target: string;
	importKind: string;
	isResolved: boolean;
}

export interface GraphFolderNode {
	id: string;
	folder: string;
	fileCount: number;
	incomingCount: number;
	outgoingCount: number;
}

export interface GraphFolderEdge {
	id: string;
	source: string;
	target: string;
	edgeCount: number;
}

export interface GraphData {
	nodes: GraphNode[];
	edges: GraphEdge[];
	folderNodes?: GraphFolderNode[];
	folderEdges?: GraphFolderEdge[];
	cycles?: Array<{ nodeIds: string[] }>;
	timestamp: number;
	error?: string;
}

// ---- Builder ----

export function buildGraphData(
	files: LocalGraphFile[],
	importEdges: LocalGraphEdge[],
	options?: { monorepoAware?: boolean },
): GraphData {
	const monorepoAware = options?.monorepoAware ?? false;

	// 1. Build file stats map
	const fileStats = new Map<
		string,
		{
			id: string;
			path: string;
			language: string | null;
			inboundCount: number;
			outboundCount: number;
			isParseable: boolean;
		}
	>();

	for (const file of files) {
		fileStats.set(file.id, {
			id: file.id,
			path: file.path,
			language: file.language,
			inboundCount: 0,
			outboundCount: 0,
			isParseable: file.isParseable,
		});
	}

	// 2. Aggregate edges
	const seenEdges = new Set<string>();
	const graphEdges: GraphEdge[] = [];
	const internalAdjacency = new Map<string, Set<string>>();
	const folderStats = new Map<
		string,
		{
			id: string;
			folder: string;
			fileCount: number;
			incomingCount: number;
			outgoingCount: number;
		}
	>();
	const folderEdgeCounts = new Map<string, GraphFolderEdge>();

	const ensureFolderStats = (folder: string) => {
		let existing = folderStats.get(folder);
		if (existing) return existing;
		existing = {
			id: `folder:${folder}`,
			folder,
			fileCount: 0,
			incomingCount: 0,
			outgoingCount: 0,
		};
		folderStats.set(folder, existing);
		return existing;
	};

	for (const edge of importEdges) {
		const sourceStats = fileStats.get(edge.sourceFileId);
		const targetStats = fileStats.get(edge.targetFileId);
		if (!sourceStats || !targetStats) continue;

		sourceStats.outboundCount += 1;
		targetStats.inboundCount += 1;

		const edgeKey = `${edge.sourceFileId}->${edge.targetFileId}`;
		if (!seenEdges.has(edgeKey)) {
			seenEdges.add(edgeKey);
			graphEdges.push({
				id: edgeKey,
				source: edge.sourceFileId,
				target: edge.targetFileId,
				importKind: edge.importKind,
				isResolved: edge.isResolved,
			});
		}

		// Build internal adjacency for cycle detection
		let adj = internalAdjacency.get(edge.sourceFileId);
		if (!adj) {
			adj = new Set<string>();
			internalAdjacency.set(edge.sourceFileId, adj);
		}
		adj.add(edge.targetFileId);

		// Folder stats
		const sourceFolder = toTopLevelFolder(sourceStats.path, monorepoAware);
		const targetFolder = toTopLevelFolder(targetStats.path, monorepoAware);
		const sourceFolderStats = ensureFolderStats(sourceFolder);
		const targetFolderStats = ensureFolderStats(targetFolder);

		sourceFolderStats.outgoingCount += 1;
		targetFolderStats.incomingCount += 1;

		if (sourceFolder !== targetFolder) {
			const sourceFolderId = `folder:${sourceFolder}`;
			const targetFolderId = `folder:${targetFolder}`;
			const folderEdgeKey = `${sourceFolderId}->${targetFolderId}`;
			const existing = folderEdgeCounts.get(folderEdgeKey);
			if (existing) {
				existing.edgeCount += 1;
			} else {
				folderEdgeCounts.set(folderEdgeKey, {
					id: folderEdgeKey,
					source: sourceFolderId,
					target: targetFolderId,
					edgeCount: 1,
				});
			}
		}
	}

	// 3. Cycle detection
	const sourceFiles = Array.from(fileStats.values()).filter((f) => f.isParseable);
	const sccs = tarjanSCC(
		sourceFiles.map((f) => f.id),
		internalAdjacency,
	);

	const cycles: Array<{ nodeIds: string[] }> = [];
	const seenDirectCycleKeys = new Set<string>();

	// Direct 2-node cycles
	for (const [sourceId, targetIds] of internalAdjacency.entries()) {
		for (const targetId of targetIds) {
			if (!internalAdjacency.get(targetId)?.has(sourceId)) continue;

			const sourcePath = fileStats.get(sourceId)?.path;
			const targetPath = fileStats.get(targetId)?.path;
			if (!sourcePath || !targetPath) continue;

			const sortedPaths = [sourcePath, targetPath].sort((a, b) => a.localeCompare(b));
			const key = sortedPaths.join("::");
			if (seenDirectCycleKeys.has(key)) continue;
			seenDirectCycleKeys.add(key);

			const sortedIds = sortedPaths.map(
				(p) => Array.from(fileStats.values()).find((f) => f.path === p)?.id ?? "",
			);
			cycles.push({ nodeIds: sortedIds.filter(Boolean) });
		}
	}

	// SCC cycles (3+ nodes)
	for (const component of sccs) {
		if (component.length < 3) continue;
		const sorted = [...component].sort();
		cycles.push({ nodeIds: sorted });
	}

	// 4. Build nodes
	const nodeSet = new Set<string>();
	for (const cycle of cycles) {
		for (const id of cycle.nodeIds) {
			nodeSet.add(id);
		}
	}

	const nodes: GraphNode[] = Array.from(fileStats.values()).map((file) => {
		const lastSlash = file.path.lastIndexOf("/");
		const dirPath = lastSlash >= 0 ? file.path.slice(0, lastSlash) : "";
		const label = toPathBaseName(file.path);
		const baseName = toPathBaseName(file.path);
		const folder = toTopLevelFolder(file.path, monorepoAware);
		const folderNode = ensureFolderStats(folder);
		folderNode.fileCount += 1;

		// Category heuristic
		let category: GraphNode["category"] = "other";
		const reason = buildEntryLikeReason(baseName, file.path, file.outboundCount, file.inboundCount);
		if (reason.includes("entry-style") || reason.includes("high-signal index")) {
			category = "entry";
		} else if (file.outboundCount >= 5 || file.inboundCount >= 5) {
			category = "core";
		} else if (reason.includes("high outgoing") || file.inboundCount >= 2) {
			category = "shared";
		}

		return {
			id: file.id,
			label,
			path: file.path,
			language: file.language ?? undefined,
			dirPath,
			isInCycle: nodeSet.has(file.id),
			inboundCount: file.inboundCount,
			outboundCount: file.outboundCount,
			category,
		};
	});

	return {
		nodes,
		edges: graphEdges,
		folderNodes: Array.from(folderStats.values()).sort((a, b) => {
			if (a.fileCount !== b.fileCount) return b.fileCount - a.fileCount;
			return a.folder.localeCompare(b.folder);
		}),
		folderEdges: Array.from(folderEdgeCounts.values()).sort((a, b) => {
			if (a.edgeCount !== b.edgeCount) return b.edgeCount - a.edgeCount;
			return a.id.localeCompare(b.id);
		}),
		cycles: cycles.length > 0 ? cycles : undefined,
		timestamp: Date.now(),
	};
}