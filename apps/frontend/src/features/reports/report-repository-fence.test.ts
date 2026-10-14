import { describe, expect, it } from 'vitest';
import { reportRepositoryMatches } from './report-repository-fence';

describe('local report repository render fence', () => {
  it('retains rendered facts when a record update replaces the repository but not its authorized catalog', () => {
    const db = {};
    const calculated = {
      db,
      viewer: 'me',
      projects: new Map([['p', { confidential: false }]]),
    };
    const refreshed = {
      ...calculated,
      projects: new Map([['p', { confidential: false }]]),
    };
    expect(reportRepositoryMatches(true, refreshed, calculated)).toBe(true);
    expect(
      reportRepositoryMatches(
        true,
        { ...refreshed, viewer: 'other' },
        calculated,
      ),
    ).toBe(false);
    expect(
      reportRepositoryMatches(true, { ...refreshed, db: {} }, calculated),
    ).toBe(false);
    expect(
      reportRepositoryMatches(
        true,
        { ...refreshed, projects: new Map() },
        calculated,
      ),
    ).toBe(false);
    expect(
      reportRepositoryMatches(
        true,
        { ...refreshed, projects: new Map([['p', { confidential: true }]]) },
        calculated,
      ),
    ).toBe(false);
  });
  it('hides old facts immediately when source-only revocation replaces the repository', () => {
    // Owner, query and both global revisions have not changed. A source parent
    // denial during branch divergence emits a new, filtered repository instead.
    const calculated = { viewer: 'me', query: 'today', records: ['revoked'] };
    const filtered = { viewer: 'me', query: 'today', records: [] };
    const cachedReport = { totalMinutes: 60 };
    const render = (current: object | undefined) =>
      reportRepositoryMatches(true, current, calculated) ? cachedReport : null;
    expect(render(calculated)).toBe(cachedReport);
    expect(render(filtered)).toBeNull(); // before any passive effect runs
    expect(render(undefined)).toBeNull();
  });

  it('uses identity, not equivalent owner/query/content', () => {
    const repository = { viewer: 'me', query: 'today' };
    expect(reportRepositoryMatches(true, { ...repository }, repository)).toBe(
      false,
    );
    expect(reportRepositoryMatches(true, repository, undefined)).toBe(false);
    expect(reportRepositoryMatches(true, undefined, undefined)).toBe(false);
  });

  it('retains the result when a coherence-only notification keeps the repository', () => {
    const repository = {};
    const confirmed = { repository, coherent: true };
    const synchronizing = { repository, coherent: false };
    expect(
      reportRepositoryMatches(true, confirmed.repository, repository),
    ).toBe(true);
    expect(
      reportRepositoryMatches(true, synchronizing.repository, repository),
    ).toBe(true);
  });

  it('does not add a repository requirement to callable modes', () => {
    expect(reportRepositoryMatches(false, undefined, undefined)).toBe(true);
    expect(reportRepositoryMatches(false, {}, {})).toBe(true);
  });
});
