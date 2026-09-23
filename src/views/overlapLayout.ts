export interface LayoutInput {
	id: string;
	startMin: number;
	endMin: number;
}

export interface LayoutResult extends LayoutInput {
	col: number;
	totalCols: number;
}

/**
 * Assigns side-by-side columns to overlapping time blocks (classic calendar
 * "collision cluster" algorithm). Non-overlapping blocks share column 0 with
 * totalCols 1. Within a cluster of mutually-overlapping blocks, each block
 * gets the first free column, and totalCols is the number of columns the
 * whole cluster ended up needing.
 */
export function layoutOverlaps(items: LayoutInput[]): LayoutResult[] {
	const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
	const result: LayoutResult[] = [];

	let cluster: LayoutInput[] = [];
	let clusterEnd = -Infinity;

	const flush = () => {
		if (cluster.length === 0) return;
		const colEndTimes: number[] = [];
		cluster.forEach((it) => {
			let col = colEndTimes.findIndex((end) => end <= it.startMin);
			if (col === -1) {
				col = colEndTimes.length;
				colEndTimes.push(it.endMin);
			} else {
				colEndTimes[col] = it.endMin;
			}
			result.push({ ...it, col, totalCols: 0 }); // totalCols filled in below
		});
		const totalCols = colEndTimes.length;
		for (let i = result.length - cluster.length; i < result.length; i++) {
			result[i].totalCols = totalCols;
		}
		cluster = [];
	};

	for (const it of sorted) {
		if (cluster.length > 0 && it.startMin >= clusterEnd) {
			flush();
			clusterEnd = -Infinity;
		}
		cluster.push(it);
		clusterEnd = Math.max(clusterEnd, it.endMin);
	}
	flush();

	return result;
}
