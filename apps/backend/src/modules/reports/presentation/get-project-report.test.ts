import { describe, expect, it, vi } from 'vitest';
import {
  getProjectReportHandler,
  type ReportAuth,
} from './get-project-report.js';
import type { ProjectReportRepository } from '../domain/project-report.js';
const auth: ReportAuth = {
  uid: 'alice',
  token: {
    email: 'alice@wads.dev',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  },
};
function setup() {
  const readPage = vi
    .fn<ProjectReportRepository['readPage']>()
    .mockResolvedValue({ records: [], topicLabels: {}, nextCursor: null });
  const userLabels = vi
    .fn<ProjectReportRepository['userLabels']>()
    .mockResolvedValue({});
  return {
    repository: {
      readPage,
      userLabels,
      loadContext: vi
        .fn<ProjectReportRepository['loadContext']>()
        .mockResolvedValue([]),
    },
    readPage,
  };
}
describe('getProjectReport callable adapter', () => {
  it.each([
    undefined,
    { ...auth, token: { ...auth.token, email: 'alice@gmail.com' } },
    { ...auth, token: { ...auth.token, email: 'alice@wads.dev.evil' } },
    { ...auth, token: { ...auth.token, email_verified: false } },
    {
      ...auth,
      token: { ...auth.token, firebase: { sign_in_provider: 'password' } },
    },
  ])('rejects invalid authentication before reading data', async (invalid) => {
    const { repository, readPage } = setup();
    await expect(
      getProjectReportHandler(repository, { projectId: 'project' }, invalid),
    ).rejects.toMatchObject({
      code: invalid ? 'permission-denied' : 'unauthenticated',
    });
    expect(readPage).not.toHaveBeenCalled();
  });
  it.each([
    { projectId: '../project' },
    { projectId: 'project', limit: 501 },
    { projectId: 'project', cursor: 'oauth_tokens/secret' },
  ])('validates bounded inputs', async (data) => {
    const { repository, readPage } = setup();
    await expect(
      getProjectReportHandler(repository, data, auth),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(readPage).not.toHaveBeenCalled();
  });
  it('returns only the aggregate contract and forwards pagination', async () => {
    const { repository, readPage } = setup();
    const result = await getProjectReportHandler(
      repository,
      { projectId: 'project', limit: 20, cursor: 'users/alice/records/one' },
      auth,
      Date.parse('2026-10-08T20:00:00Z'),
    );
    expect(readPage).toHaveBeenNthCalledWith(
      1,
      'project',
      20,
      'users/alice/records/one',
    );
    expect(result).toMatchObject({
      policy: 'project-report-v3',
      asOf: '2026-10-08T20:00:00.000Z',
      page: { partial: false },
      scope: 'all-selected',
      totalMinutes: 0,
    });
    expect(JSON.stringify(result)).not.toContain('alice@wads.dev');
  });
  it('maps missing project and hides infrastructure details', async () => {
    const { repository, readPage } = setup();
    readPage.mockResolvedValue(null);
    await expect(
      getProjectReportHandler(repository, { projectId: 'project' }, auth),
    ).rejects.toMatchObject({ code: 'not-found' });
    readPage.mockRejectedValue(new Error('private credentials'));
    await expect(
      getProjectReportHandler(repository, { projectId: 'project' }, auth),
    ).rejects.toMatchObject({
      code: 'internal',
      message: 'Não foi possível consultar o relatório.',
    });
  });
});
