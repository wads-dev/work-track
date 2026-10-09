import { describe, expect, it, vi } from 'vitest';
import { ListProjectRecords } from './list-project-records.js';
import type { ReportRecord } from '../domain/report-record.js';

function setup() {
  const listByProject = vi
    .fn<(projectId: string, limit: number) => Promise<ReportRecord[]>>()
    .mockResolvedValue([]);
  return { listByProject, service: new ListProjectRecords({ listByProject }) };
}

describe('ListProjectRecords', () => {
  it('defaults to a bounded query and returns repository records unchanged', async () => {
    const { service, listByProject } = setup();
    const records = [
      {
        id: 'record',
        projectId: 'project-1',
        uid: 'alice',
        startedAt: '2026-10-08T21:00:00-03:00',
      },
    ];
    listByProject.mockResolvedValue(records);
    await expect(service.execute('project-1')).resolves.toBe(records);
    expect(listByProject).toHaveBeenCalledExactlyOnceWith('project-1', 100);
  });

  it.each([1, 500])('accepts the limit boundary %s', async (limit) => {
    const { service, listByProject } = setup();
    await expect(service.execute('project_1', limit)).resolves.toEqual([]);
    expect(listByProject).toHaveBeenCalledExactlyOnceWith('project_1', limit);
  });

  it.each(['', ' ', 'project/records', '../project', 'á', 'x'.repeat(129)])(
    'rejects invalid project IDs before querying: %s',
    (projectId) => {
      const { service, listByProject } = setup();
      expect(() => service.execute(projectId)).toThrow('Projeto inválido.');
      expect(listByProject).not.toHaveBeenCalled();
    },
  );

  it('accepts the maximum project ID length', async () => {
    const { service, listByProject } = setup();
    const projectId = 'x'.repeat(128);
    await service.execute(projectId);
    expect(listByProject).toHaveBeenCalledExactlyOnceWith(projectId, 100);
  });

  it.each([0, -1, 501, 1.5, NaN, Infinity])(
    'rejects invalid limits: %s',
    (limit) => {
      const { service, listByProject } = setup();
      expect(() => service.execute('project', limit)).toThrow(
        'Limite inválido.',
      );
      expect(listByProject).not.toHaveBeenCalled();
    },
  );

  it('propagates infrastructure failure rather than returning a misleading empty report', async () => {
    const { service, listByProject } = setup();
    const failure = new Error('Firestore unavailable');
    listByProject.mockRejectedValue(failure);
    await expect(service.execute('project')).rejects.toBe(failure);
  });
});
