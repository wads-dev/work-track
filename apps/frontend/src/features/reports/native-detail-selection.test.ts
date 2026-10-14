import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const source = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');
it('report screens use repository detail APIs, never snapshot record lists or ID scans', () => {
  const personal = source('./PersonalPage.tsx');
  expect(personal).toContain('.readDescriptions(');
  expect(personal).toContain('.readReportCatalog(');
  expect(personal).not.toContain('localRepository?.records');
  for (const path of [
    './PersonalPage.tsx',
    './ProjectReport.tsx',
    './TopicDetails.tsx',
  ]) {
    expect(source(path)).not.toMatch(/[.]find\(|[.]filter\(/);
    expect(source(path)).not.toContain('projects.rows.find');
  }
  const drawer = source('../records/RecordDrawer.tsx');
  expect(drawer).toContain('observeRecordDetail(db, uid, recordId');
  expect(drawer).not.toMatch(/snapshot.records|[.]find\(|[.]filter\(/);
  expect(drawer).toContain('!editorDirty.current');
  expect(drawer).toContain('expectedUpdatedAt: editorVersion.current');
});
it('loading never tears down a ready catalog or report subscription', () => {
  for (const path of [
    './PersonalPage.tsx',
    './ProjectReport.tsx',
    './TopicDetails.tsx',
  ]) {
    const text = source(path);
    expect(text).not.toContain('projects.loading || !projects.complete');
    expect(text).not.toContain('    projects.loading,');
    expect(text).not.toContain('!projects.loading &&');
    expect(text).not.toContain('setCatalogState(null)');
  }
  const topic = source('./TopicDetails.tsx');
  const identity = topic.split('const identity =')[1].split(']);')[0];
  expect(identity).not.toContain('attempt');
  expect(topic).toContain(
    'data: previous.identity === identity ? previous.data : undefined',
  );
  expect(topic).toContain('aria-busy={loading}');
  expect(topic).toContain('motion-safe:animate-spin');
  expect(topic).toContain('onClick={() => setAttempt((n) => n + 1)}');
});
it('shared audit hook receives a prepared repository dataset without selecting snapshot rows', () => {
  const audit = source('../../shared/data.ts');
  expect(audit).toContain(
    'observeRecordAudit(db, uid, parts[3], maxRows, setState)',
  );
  expect(audit).not.toMatch(/snapshot[.]|[.]find\(|[.]filter\(|[.]slice\(/);
});
it('description formatting accepts one prepared source and rechecks owner/project identity', () => {
  const details = source('./calendar-event-details.ts');
  expect(details).not.toMatch(/[.]find\(|[.]filter\(/);
  expect(details).toContain('source.projectId === item.projectId');
  expect(details).toContain('source.uid === (item.uid || viewerUid)');
});
