import { expect, it } from 'vitest';
import { globalEstimates, recordKey } from './global-estimates.js';
import type { ReportSourceRecord } from './project-report.js';
const first: ReportSourceRecord = {
  id: 'work',
  uid: 'alice',
  projectId: 'work',
  startedAt: '2026-10-08T21:00:00-03:00',
  timeZone: 'America/Sao_Paulo',
  topics: [],
};
const candidate = (
  projectId: string,
  minutes?: number,
): ReportSourceRecord => ({
  id: 'voice',
  uid: 'alice',
  projectId,
  startedAt: '2026-10-08T22:31:00-03:00',
  ...(minutes === undefined
    ? {}
    : {
        endedAt: new Date(
          Date.parse('2026-10-08T22:31:00-03:00') + minutes * 60000,
        ).toISOString(),
      }),
  timeZone: 'America/Sao_Paulo',
  topics: [],
});
const end = (next: ReportSourceRecord) =>
  globalEstimates([first, next], Date.parse('2026-10-09T04:00:00Z')).ends.get(
    recordKey(first),
  );
it('WorkTrack21 open +LiveVoice22:31-22:34 never cuts across projects', () => {
  expect(end(candidate('voice', 3))).toBe(
    Date.parse('2026-10-09T00:00:00-03:00'),
  );
});
it('sameproject closed<15 ignored; exactly15 and open cut', () => {
  expect(end(candidate('work', 3))).toBe(
    Date.parse('2026-10-09T00:00:00-03:00'),
  );
  expect(end(candidate('work', 15))).toBe(
    Date.parse('2026-10-08T22:31:00-03:00'),
  );
  expect(end(candidate('work'))).toBe(Date.parse('2026-10-08T22:31:00-03:00'));
});
