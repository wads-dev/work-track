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
export type AxisSegment = {
  start: number;
  end: number;
  top: number;
  height: number;
  collapsed: boolean;
};
export function commonGaps(
  intervals: { start: number; end: number }[],
  first: number,
  last: number,
) {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .map((i) => ({
      start: Math.max(first, i.start),
      end: Math.min(last, i.end),
    }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);
  const union: { start: number; end: number }[] = [];
  for (const item of sorted) {
    const prev = union[union.length - 1];
    if (prev && item.start <= prev.end) prev.end = Math.max(prev.end, item.end);
    else union.push({ ...item });
  }
  return union
    .slice(1)
    .map((item, index) => ({ start: union[index].end, end: item.start }))
    .filter((g) => g.end - g.start >= 240);
}
export function axisSegments(
  first: number,
  last: number,
  gaps: { start: number; end: number }[],
  expanded: string[],
  px = 1.1,
) {
  const segments: AxisSegment[] = [];
  let minute = first,
    top = 0;
  for (const gap of gaps) {
    if (gap.start > minute) {
      const height = (gap.start - minute) * px;
      segments.push({
        start: minute,
        end: gap.start,
        top,
        height,
        collapsed: false,
      });
      top += height;
    }
    const collapsed = !expanded.includes(gap.start + '-' + gap.end);
    const height = collapsed ? 32 : (gap.end - gap.start) * px;
    segments.push({ ...gap, top, height, collapsed });
    top += height;
    minute = gap.end;
  }
  if (minute < last)
    segments.push({
      start: minute,
      end: last,
      top,
      height: (last - minute) * px,
      collapsed: false,
    });
  return segments;
}
export function projectMinute(minute: number, segments: AxisSegment[]) {
  const segment =
    segments.find((s) => minute >= s.start && minute <= s.end) ??
    segments[segments.length - 1];
  if (!segment) return 0;
  return (
    segment.top +
    ((minute - segment.start) / (segment.end - segment.start)) * segment.height
  );
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
