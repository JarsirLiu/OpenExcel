import XLSX from "xlsx-js-style";

export type MergeEntry = {
  range: XLSX.Range;
  config: { r: number; c: number; rs: number; cs: number };
  order: number;
};

export type MergeIndex = {
  find(row: number, column: number): MergeEntry | undefined;
};

function compareMergeEntries(left: MergeEntry, right: MergeEntry): number {
  return left.range.s.c - right.range.s.c || left.order - right.order;
}

/** Index merge ranges by row and search the row's column intervals in order. */
export function createMergeIndex(merges: readonly XLSX.Range[]): MergeIndex {
  const rows = new Map<number, MergeEntry[]>();

  merges.forEach((range, order) => {
    const entry: MergeEntry = {
      range,
      order,
      config: {
        r: range.s.r,
        c: range.s.c,
        rs: range.e.r - range.s.r + 1,
        cs: range.e.c - range.s.c + 1,
      },
    };
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      const bucket = rows.get(row);
      if (bucket) bucket.push(entry);
      else rows.set(row, [entry]);
    }
  });

  for (const bucket of rows.values()) {
    bucket.sort(compareMergeEntries);
    for (let index = 1; index < bucket.length; index += 1) {
      if (bucket[index - 1].range.e.c >= bucket[index].range.s.c) {
        throw new Error("Excel 文件包含重叠的合并区域");
      }
    }
  }

  return {
    find(row, column) {
      const bucket = rows.get(row);
      if (!bucket) return undefined;
      let low = 0;
      let high = bucket.length - 1;
      let candidate = -1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        if (bucket[middle].range.s.c <= column) {
          candidate = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      const entry = candidate >= 0 ? bucket[candidate] : undefined;
      return entry && column <= entry.range.e.c ? entry : undefined;
    },
  };
}

export function toMergeConfig(merges: readonly XLSX.Range[]) {
  const merge: Record<string, { r: number; c: number; rs: number; cs: number }> = {};
  for (const range of merges) {
    const ref = XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c });
    merge[ref] = {
      r: range.s.r,
      c: range.s.c,
      rs: range.e.r - range.s.r + 1,
      cs: range.e.c - range.s.c + 1,
    };
  }
  return merge;
}
