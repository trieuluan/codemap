export const MONOREPO_ROOT_SEGMENTS = new Set(["packages", "apps", "libs", "services"]);

export function toPathBaseName(filePath: string) {
	const lastSegment = filePath.split("/").pop() ?? filePath;
	return lastSegment.replace(/\.[^.]+$/, "");
}

export function toTopLevelFolder(filePath: string, monorepoAware = false) {
	if (!filePath.includes("/")) {
		return "(root)";
	}

	const parts = filePath.split("/");
	const first = parts[0] || "(root)";

	if (monorepoAware && MONOREPO_ROOT_SEGMENTS.has(first) && parts[1]) {
		return `${first}/${parts[1]}`;
	}

	return first;
}

export function buildEntryLikeReason(
	baseName: string,
	path: string,
	outgoingCount: number,
	incomingCount: number,
): string {
	const reasons: string[] = [];

	if (["main", "app", "server", "cli", "worker", "entry", "bootstrap"].includes(baseName)) {
		reasons.push(`entry-style filename: ${baseName}`);
	} else if (baseName === "index") {
		reasons.push("high-signal index file");
	}

	const pathParts = path.split("/");
	const isMonorepoSrc =
		MONOREPO_ROOT_SEGMENTS.has(pathParts[0] ?? "") &&
		pathParts[2] === "src" &&
		pathParts.length === 4;

	if (!path.includes("/")) {
		reasons.push("root-level file");
	} else if (path.startsWith("src/") || path.startsWith("app/") || isMonorepoSrc) {
		reasons.push("top-level source path");
	}

	if (outgoingCount >= 5) {
		reasons.push("high outgoing dependency count");
	} else if (outgoingCount >= 3) {
		reasons.push("multiple internal dependencies");
	}

	if (incomingCount === 0) {
		reasons.push("not imported by other internal files");
	}

	return reasons.join(" · ");
}

/**
 * Tarjan's strongly connected components algorithm.
 * Returns SCCs with 3+ nodes (single cycles and 2-node cycles are handled separately).
 */
export function tarjanSCC(
	nodeIds: string[],
	adjacency: Map<string, Set<string>>,
): string[][] {
	const visitedIndices = new Map<string, number>();
	const lowLinks = new Map<string, number>();
	const stack: string[] = [];
	const stackSet = new Set<string>();
	let index = 0;
	const sccs: string[][] = [];

	const strongConnect = (nodeId: string) => {
		visitedIndices.set(nodeId, index);
		lowLinks.set(nodeId, index);
		index += 1;
		stack.push(nodeId);
		stackSet.add(nodeId);

		for (const neighborId of adjacency.get(nodeId) ?? []) {
			if (!visitedIndices.has(neighborId)) {
				strongConnect(neighborId);
				lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId) ?? 0, lowLinks.get(neighborId) ?? 0));
			} else if (stackSet.has(neighborId)) {
				lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId) ?? 0, visitedIndices.get(neighborId) ?? 0));
			}
		}

		if (lowLinks.get(nodeId) === visitedIndices.get(nodeId)) {
			const component: string[] = [];
			let curr: string | undefined;
			do {
				curr = stack.pop();
				if (!curr) break;
				stackSet.delete(curr);
				component.push(curr);
			} while (curr !== nodeId);
			if (component.length > 1) sccs.push(component);
		}
	};

	for (const id of nodeIds) {
		if (!visitedIndices.has(id)) strongConnect(id);
	}

	return sccs;
}