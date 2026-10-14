import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const source = (name: string) =>
  readFileSync(new URL('./' + name, import.meta.url), 'utf8');
describe('privacy query lifetime regressions', () => {
  it('permanently clears retained query on account or masking changes, independent of URL filters', () => {
    const dashboard = source('../../features/dashboard/Dashboard.tsx');
    expect(dashboard).toContain("setQuery({ uid, revealed, text: '' });");
    expect(dashboard).toContain('}, [uid, revealed]);');
    expect(dashboard).toContain(
      'query.uid === uid && query.revealed === revealed',
    );
    expect(dashboard).not.toContain('if (revealed) setLocalFilter');
  });
  it('remounts records, report, merge and calendar selectors on masking changes', () => {
    expect(source('../../features/dashboard/Dashboard.tsx')).toContain(
      'key={uid + String(revealed)}',
    );
    expect(source('../../features/reports/ReportToolbar.tsx')).toContain(
      'key={String(revealed)}',
    );
    expect(source('../../features/projects/ProjectEditor.tsx')).toContain(
      'String(revealed)',
    );
    expect(source('../../features/reports/PersonalPage.tsx')).toContain(
      'key={String(revealed)}',
    );
  });
  it('uses the design-system selector with an independent search query', () => {
    const selector = source('../../features/projects/ProjectSelector.tsx');
    expect(selector).toContain(
      "const [searchQuery, setSearchQuery] = useState('');",
    );
    expect(selector).toContain('repository.search(searchQuery)');
    expect(selector).not.toContain('matchesProject(');
    expect(selector).toContain('<SelectTrigger');
    expect(selector).toContain('<SelectContent');
    expect(selector).not.toContain('matchesProject(option, selected.label)');
  });
  it('never clears selection due to typing or resetting the search', () => {
    const selector = source('../../features/projects/ProjectSelector.tsx');
    expect(selector).toContain('repository.read(projectId)');
    expect(selector).toContain(
      "onChange(value === allValue ? '' : value.slice('project:'.length))",
    );
    expect(selector).toContain(
      'onChange={(event) => setSearchQuery(event.target.value)}',
    );
    expect(selector).toContain("setSearchQuery('')");
    expect(selector).not.toContain('onChange(searchQuery)');
  });
});
it('project catalog observes complete local materialization with zero remote reads', () => {
  const hook = readFileSync(
    new URL('../../features/projects/hooks/useProjects.ts', import.meta.url),
    'utf8',
  );
  const source = readFileSync(
    new URL('../../data/sources/authorized-project-source.ts', import.meta.url),
    'utf8',
  );
  expect(hook).toContain('subscribeAuthorizedProjects(');
  expect(hook).not.toContain('loadAllProjects');
  expect(hook).not.toContain('listProjects');
  expect(source).toContain('observeWorkspace(db, uid');
  expect(source).toContain('readProjectListing(db, uid, ids, options)');
  expect(source).toContain('if (!snapshot.complete) return;');
  expect(source).not.toContain('snapshot.projects.filter');
  for (const remote of ['onSnapshot', 'getDocs', 'getDoc(', 'httpsCallable']) {
    expect(source).not.toContain(remote);
    expect(hook).not.toContain(remote);
  }
});
it('topic detail runs the local usecase only on coherent authorized state', () => {
  const details = source('../../features/reports/TopicDetails.tsx');
  expect(details).toContain('subscribeAuthorizedReport(');
  expect(details).toContain('if (!snapshot.coherent) return;');
  expect(details).toContain('void getTopicReport(');
  expect(details).toContain(
    'new LocalTopicReportRepository(snapshot.repository)',
  );
  expect(details).toContain('projectAccessRevision() === access');
  expect(details).toContain('deletionRevision(uid) === deletion');
  expect(details).toContain('version === revision');
  expect(details).toContain('validateTopicReport(');
  const repository = source('../../data/sources/local-topic-report.ts');
  expect(repository).toContain('FirestoreReportRepository');
  expect(repository).not.toContain('.filter(');
  expect(repository).toContain(
    'this.source.revalidate(rows, viewer, personal, false)',
  );
  expect(repository).toContain('this.projectRepository.readPage(');
  for (const text of [details, repository])
    for (const remote of ['onSnapshot', 'getDoc(', 'getDocs', 'httpsCallable'])
      expect(text).not.toContain(remote);
});
it('report errors remain visible and retries reopen project subscriptions', () => {
  for (const file of ['PersonalPage', 'ProjectReport']) {
    const source = readFileSync(
      new URL('../../features/reports/' + file + '.tsx', import.meta.url),
      'utf8',
    );
    expect(source.indexOf('if (projects.error) {')).toBeLessThan(
      source.indexOf('if (!projects.complete) return;'),
    );
    expect(source).toContain('if (projects.error) projects.retry();');
  }
});
