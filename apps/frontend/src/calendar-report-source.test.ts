import { beforeEach, expect, it, vi } from 'vitest';
import type { PersonalReportSnapshot } from './personal-report-source';
interface MockSnapshot {
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
  docs?: { id: string; data: () => Record<string, unknown> }[];
  data?: () => Record<string, unknown>;
}

const listeners = vi.hoisted(
  () =>
    new Map<
      string,
      {
        next: (s: MockSnapshot) => void;
        error: (e: Error) => void;
        stop: ReturnType<typeof vi.fn>;
      }
    >(),
);
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  where: (field: string, op: string, value: string) => ({ field, op, value }),
  query: (
    path: string,
    ...filters: { field: string; op: string; value: string }[]
  ) =>
    path +
    ':' +
    (filters[0].field === 'projectId'
      ? 'project:' + filters[1].field
      : filters[0].field),
  and: (...c: unknown[]) => c,
  or: (...c: unknown[]) => c,
  onSnapshot: (
    ref: string,
    _options: unknown,
    next: (snapshot: MockSnapshot) => void,
    error: (error: Error) => void,
  ) => {
    const stop = vi.fn();
    listeners.set(ref, { next, error, stop });
    return stop;
  },
}));
import { subscribePersonalReport } from './personal-report-source';
import type { Firestore } from 'firebase/firestore';
const metadata = { fromCache: false, hasPendingWrites: false };
const r = (id: string, endedAt?: string) => ({
  id,
  data: () => ({
    projectId: 'p',
    startedAt: '2026-10-08T12:00:00Z',
    endedAt,
    timeZone: 'UTC',
    topics: [],
  }),
});
beforeEach(() => listeners.clear());
it('waits for both query branches, keeps missing-end records, deduplicates and disposes', async () => {
  const next = vi.fn<(snapshot: PersonalReportSnapshot) => void>(),
    fail = vi.fn();
  const stop = subscribePersonalReport({} as Firestore, 'a', next, fail, [], {
    from: '2026-10-08T00:00:00Z',
    to: '2026-10-09T00:00:00Z',
  });
  const starts = listeners.get('users/a/records:startedAt')!,
    ends = listeners.get('users/a/records:endedAt')!;
  starts.next({
    docs: [r('open'), r('closed', '2026-10-08T13:00:00Z')],
    metadata,
  });
  expect(next).not.toHaveBeenCalled();
  ends.next({ docs: [r('closed', '2026-10-08T13:00:00Z')], metadata });
  expect(next).not.toHaveBeenCalled();
  listeners
    .get('projects/p')!
    .next({ data: () => ({ type: 'work', topics: [] }), metadata });
  const context = await next.mock.lastCall![0].repository.loadContext(['a']);
  expect(context.map((r) => r.id).sort()).toEqual(['closed', 'open']);
  expect(next.mock.lastCall![0].fromCache).toBe(false);
  stop();
  for (const l of listeners.values()) expect(l.stop).toHaveBeenCalled();
  expect(fail).not.toHaveBeenCalled();
});
it('waits for project-filtered selection to converge with budget context', async () => {
  const next = vi.fn<(snapshot: PersonalReportSnapshot) => void>(),
    fail = vi.fn();
  const stop = subscribePersonalReport(
    {} as Firestore,
    'a',
    next,
    fail,
    ['p'],
    {
      from: '2026-10-08T00:00:00Z',
      to: '2026-10-09T00:00:00Z',
      projectId: 'p',
    },
  );
  const batch = { docs: [r('open')], metadata };
  listeners.get('users/a/records:startedAt')!.next(batch);
  listeners.get('users/a/records:endedAt')!.next({ docs: [], metadata });
  listeners
    .get('users/a/records:project:startedAt')!
    .next({ docs: [], metadata });
  listeners
    .get('users/a/records:project:endedAt')!
    .next({ docs: [], metadata });
  expect(next).not.toHaveBeenCalled();
  listeners.get('users/a/records:project:startedAt')!.next(batch);
  listeners
    .get('projects/p')!
    .next({ data: () => ({ type: 'work', topics: [] }), metadata });
  expect(
    (await next.mock.lastCall![0].repository.readPage('a', 100)).records.map(
      (r) => r.id,
    ),
  ).toEqual(['open']);
  expect(fail).not.toHaveBeenCalled();
  stop();
});
it('does not publish mixed duplicate versions through project metadata callbacks', async () => {
  const next = vi.fn<(snapshot: PersonalReportSnapshot) => void>(),
    fail = vi.fn();
  const stop = subscribePersonalReport({} as Firestore, 'a', next, fail, [], {
    from: '2026-10-08T00:00:00Z',
    to: '2026-10-09T00:00:00Z',
  });
  const starts = listeners.get('users/a/records:startedAt')!,
    ends = listeners.get('users/a/records:endedAt')!;
  const old = r('closed', '2026-10-08T13:00:00Z'),
    updated = r('closed', '2026-10-08T14:00:00Z');
  starts.next({ docs: [old], metadata });
  ends.next({ docs: [old], metadata });
  const project = listeners.get('projects/p')!;
  project.next({ data: () => ({ type: 'work', topics: [] }), metadata });
  next.mockClear();
  starts.next({ docs: [updated], metadata });
  project.next({ data: () => ({ type: 'work', topics: [] }), metadata });
  expect(next).not.toHaveBeenCalled();
  ends.next({ docs: [updated], metadata });
  expect(next).toHaveBeenCalledOnce();
  expect(
    (await next.mock.lastCall![0].repository.loadContext(['a']))[0].endedAt,
  ).toBe('2026-10-08T14:00:00Z');
  stop();
  starts.next({ docs: [old], metadata });
  expect(next).toHaveBeenCalledOnce();
  expect(fail).not.toHaveBeenCalled();
});
