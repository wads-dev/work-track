import { expect, it } from 'vitest';
import {
  axisSegments,
  commonGaps,
  GAP_LABEL_HEIGHT,
  GAP_LABEL_MARGIN,
  projectMinute,
} from './timeline-layout';
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

it.each([
  { expanded: [] },
  { expanded: ['120-397'] },
  { expanded: ['429-720'] },
  { expanded: ['120-397', '429-720'] },
])(
  'reserves label margins and aligns the ruler across multiple gaps ($expanded)',
  ({ expanded }) => {
    const segments = axisSegments(
      0,
      780,
      [
        { start: 120, end: 397 },
        { start: 429, end: 720 },
      ],
      expanded,
      1.8,
    );
    for (const gap of segments.filter((s) => s.end - s.start >= 240)) {
      const labelTop = gap.top + GAP_LABEL_MARGIN;
      const labelBottom = labelTop + GAP_LABEL_HEIGHT;
      expect(labelTop - projectMinute(gap.start, segments)).toBe(
        GAP_LABEL_MARGIN,
      );
      expect(
        projectMinute(gap.end, segments) - labelBottom,
      ).toBeGreaterThanOrEqual(GAP_LABEL_MARGIN);
      if (gap.collapsed)
        expect(gap.height).toBe(GAP_LABEL_HEIGHT + GAP_LABEL_MARGIN * 2);
      else expect(gap.height).toBe((gap.end - gap.start) * 1.8);
    }
    // Only the idle bands grow: adjacent activities retain their duration scale.
    expect(
      projectMinute(429, segments) - projectMinute(397, segments),
    ).toBeCloseTo(32 * 1.8);
    expect(
      projectMinute(780, segments) - projectMinute(720, segments),
    ).toBeCloseTo(60 * 1.8);
    expect(projectMinute(780, segments)).toBe(
      segments.reduce((height, s) => height + s.height, 0),
    );
  },
);
