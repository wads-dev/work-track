import { expect, it } from 'vitest';
import { axisSegments, commonGaps, projectMinute } from './timeline-layout';
it('places the collapsed gap strictly after a short event without covering it', () => {
  const gaps = commonGaps(
    [
      { start: 0, end: 7 },
      { start: 17, end: 37 },
      { start: 1020, end: 1200 },
    ],
    0,
    1200,
  );
  expect(gaps).toEqual([{ start: 37, end: 1020 }]);
  for (const expanded of [[], ['37-1020']]) {
    const segments = axisSegments(0, 1200, gaps, expanded, 1.8);
    const gap = segments.find((s) => s.start === 37)!;
    expect(projectMinute(37, segments)).toBe(gap.top);
    expect(projectMinute(17, segments)).toBeLessThan(gap.top);
    expect(projectMinute(1020, segments)).toBe(gap.top + gap.height);
  }
});
