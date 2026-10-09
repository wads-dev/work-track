export function commonSpan(items: { start: number; end: number }[]) {
  const valid = items.filter((item) => item.end > item.start);
  if (!valid.length) return null;
  return {
    first: Math.max(
      0,
      Math.floor(Math.min(...valid.map((i) => i.start)) / 60) * 60,
    ),
    last: Math.min(
      1440,
      Math.ceil(Math.max(...valid.map((i) => i.end)) / 60) * 60,
    ),
  };
}
export type Timed = {
  id: string;
  effectiveStartedAt: string;
  effectiveEndedAt: string;
};
export function layoutDay<T extends Timed>(
  items: T[],
  start: number,
  end: number,
) {
  const sorted = items
    .map((item) => ({
      item,
      start: Math.max(start, Date.parse(item.effectiveStartedAt)),
      end: Math.min(end, Date.parse(item.effectiveEndedAt)),
      column: 0,
      columns: 1,
    }))
    .filter(
      (x) =>
        Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start,
    )
    .sort(
      (a, b) =>
        a.start - b.start ||
        a.end - b.end ||
        a.item.id.localeCompare(b.item.id),
    );
  let group: typeof sorted = [];
  let groupEnd = -Infinity;
  let columnEnds: number[] = [];
  const finish = () => {
    for (const item of group) item.columns = columnEnds.length;
  };
  for (const item of sorted) {
    if (item.start >= groupEnd) {
      finish();
      group = [];
      columnEnds = [];
      groupEnd = -Infinity;
    }
    let column = columnEnds.findIndex((value) => value <= item.start);
    if (column < 0) column = columnEnds.length;
    columnEnds[column] = item.end;
    item.column = column;
    group.push(item);
    groupEnd = Math.max(groupEnd, item.end);
  }
  finish();
  return sorted.map((item) => ({
    ...item,
    top: (item.start - start) / (end - start),
    height: (item.end - item.start) / (end - start),
    overlap: item.columns > 1,
  }));
}
