import { it, expect, vi } from 'vitest';
import { nativeCache, row, project, state } from './firestore-report-fixture';
vi.mock(
  'firebase/firestore',
  async () =>
    (await import('./firestore-report-fixture')).nativeCache.firestore,
);
import { FirestoreReportRepository } from './firestore-report-repository';
import { decodeReportProjectMetadata } from '@work-track/data/codecs/report-project-metadata';

// Wall-clock sampling is diagnostic, not a regression gate on shared CI runners.
// Mandatory exact query/document budgets live in firestore-report-repository.test.ts.
it.runIf(process.env.WORK_TRACK_RUN_BENCHMARK === '1')(
  'synthetic complete-selection versus legacy suffix timing',
  async () => {
    for (const mode of ['personal', 'company'] as const) {
      const before: number[] = [],
        after: number[] = [];
      for (let run = 0; run < 6; run++) {
        nativeCache.reset();
        const p = project();
        nativeCache.seedWorkspace(
          state({
            projects: [p],
            records: Array.from({ length: 1000 }, (_, i) =>
              row(String(i).padStart(4, '0'), {
                endedAt: '2026-10-08T13:00:00Z',
              }),
            ),
          }),
        );
        const repo = new FirestoreReportRepository(
          nativeCache.db,
          'alice',
          new Map([
            [p.id, decodeReportProjectMetadata(p.data, 'authorized-web')],
          ]),
        );
        const own = repo.own();
        const selection = { to: '2026-10-09T00:00:00Z', includeArchived: true };
        const legacy = async () => {
          let cursor: string | undefined;
          let count = 0;
          do {
            const page =
              mode === 'personal'
                ? await own.readPage('alice', 100, cursor, selection)
                : await repo.readPage(100, cursor, undefined, selection);
            count += page.records.length;
            cursor = page.nextCursor ?? undefined;
          } while (cursor);
          expect(count).toBe(1000);
        };
        const complete = async () => {
          const page =
            mode === 'personal'
              ? await own.readCompleteSelection!('alice', selection)
              : await repo.readCompleteSelection(selection);
          expect(page.records).toHaveLength(1000);
        };
        const measure = async (action: () => Promise<void>) => {
          const t = performance.now();
          await action();
          return performance.now() - t;
        };
        // Warmup excluded; alternate execution order to reduce JIT/order bias.
        if (run % 2) {
          after.push(await measure(complete));
          before.push(await measure(legacy));
        } else {
          before.push(await measure(legacy));
          after.push(await measure(complete));
        }
      }
      const median = (samples: number[]) =>
        samples
          .slice(1)
          .sort((a, b) => a - b)[2]
          .toFixed(2);
      console.log(
        JSON.stringify({
          benchmark:
            '1000 synthetic rows; 1 warmup + 5 alternating samples; local mock, not browser/Firestore latency',
          mode,
          legacyMedianMs: median(before),
          completeMedianMs: median(after),
          legacySamplesMs: before,
          completeSamplesMs: after,
        }),
      );
    }
  },
  60_000,
);
