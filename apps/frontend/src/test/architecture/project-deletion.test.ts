import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createProjectDeletion,
  downloadProjectJson,
  ownsVisibleProject,
  type DeletionBackup,
} from '../../features/projects/project-deletion';
const backup = {
  snapshotToken: 'token',
  exportData: { records: [{ id: 'r' }], project: { id: 'p' } },
};
function setup() {
  let current = true;
  const options = {
    projectId: 'p',
    title: 'Project',
    current: () => current,
    exportProject: vi.fn(async () => backup),
    download: vi.fn(),
    deleteProject: vi.fn<
      (
        value: DeletionBackup,
        requestId: string,
        reason: string,
      ) => Promise<object>
    >(async () => ({})),
    onDeleted: vi.fn(),
    onChange: vi.fn(),
    requestId: vi.fn(() => 'request'),
  };
  const flow = createProjectDeletion(options);
  return {
    flow,
    options,
    stale: () => {
      current = false;
    },
  };
}
describe('permanent project deletion safety', () => {
  it('allows only the visible owner, never an author substitute or hidden project', () => {
    expect(ownsVisibleProject('u', { createdBy: 'u' }, false)).toBe(true);
    expect(ownsVisibleProject('u', { createdBy: 'u' }, true)).toBe(false);
    expect(
      ownsVisibleProject('u', { uid: 'u', createdBy: 'other' }, false),
    ).toBe(false);
    expect(ownsVisibleProject('', { createdBy: '' }, false)).toBe(false);
    expect(ownsVisibleProject('u', undefined, false)).toBe(false);
  });
  it('orders complete export before download; never deletes on download or without all confirmations', async () => {
    const { flow, options } = setup();
    flow.confirm(true, 'p', 'reason');
    await flow.delete();
    expect(options.deleteProject).not.toHaveBeenCalled();
    await flow.download();
    expect(options.exportProject.mock.invocationCallOrder[0]).toBeLessThan(
      options.download.mock.invocationCallOrder[0],
    );
    expect(options.download).toHaveBeenCalledWith(backup.exportData);
    expect(options.deleteProject).not.toHaveBeenCalled();
    for (const [saved, typed, reason] of [
      [false, 'p', 'reason'],
      [true, 'wrong', 'reason'],
      [true, 'p', ''],
    ] as const) {
      flow.confirm(saved, typed, reason);
      await flow.delete();
    }
    expect(options.deleteProject).not.toHaveBeenCalled();
    flow.confirm(true, 'Project', 'reason');
    await flow.delete();
    expect(options.deleteProject).toHaveBeenCalledWith(
      backup,
      'request',
      'reason',
    );
    expect(options.onDeleted).toHaveBeenCalledOnce();
  });
  it('export and browser download failures block deletion until a successful new download', async () => {
    const { flow, options } = setup();
    options.exportProject.mockRejectedValueOnce(Error('export'));
    await flow.download();
    expect(flow.snapshot().backup).toBeNull();
    options.download.mockImplementationOnce(() => {
      throw Error('click');
    });
    await flow.download();
    flow.confirm(true, 'p', 'reason');
    await flow.delete();
    expect(options.deleteProject).not.toHaveBeenCalled();
    expect(flow.canDelete()).toBe(false);
    await flow.download();
    flow.confirm(true, 'p', 'reason');
    expect(flow.canDelete()).toBe(true);
  });
  it.each(['reset', 'dispose', 'identity'] as const)(
    'fences late export after %s',
    async (action) => {
      const { flow, options, stale } = setup();
      let resolve!: (value: typeof backup) => void;
      options.exportProject.mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const pending = flow.download();
      if (action === 'identity') stale();
      else flow[action]();
      resolve(backup);
      await pending;
      expect(options.download).not.toHaveBeenCalled();
      expect(flow.canDelete()).toBe(false);
    },
  );
  it('resets backup and confirmations on cancellation', async () => {
    const { flow } = setup();
    await flow.download();
    flow.confirm(true, 'p', 'reason');
    flow.reset();
    expect(flow.snapshot()).toMatchObject({
      backup: null,
      saved: false,
      typed: '',
      reason: '',
      busy: null,
    });
  });
  it('rejects double submit and keeps request id stable on uncertain retries', async () => {
    const { flow, options } = setup();
    await flow.download();
    flow.confirm(true, 'p', 'reason');
    let reject!: (value: unknown) => void;
    options.deleteProject.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const pending = flow.delete();
    await flow.delete();
    expect(options.deleteProject).toHaveBeenCalledTimes(1);
    reject(Error('network'));
    await pending;
    await flow.delete();
    expect(options.requestId).toHaveBeenCalledTimes(1);
    expect(options.deleteProject.mock.calls[0][1]).toBe(
      options.deleteProject.mock.calls[1][1],
    );
  });
  it('drift invalidates backup and requires a new download plus new confirmations', async () => {
    const { flow, options } = setup();
    await flow.download();
    flow.confirm(true, 'p', 'reason');
    options.deleteProject.mockRejectedValueOnce({
      code: 'functions/failed-precondition',
    });
    await flow.delete();
    expect(flow.snapshot()).toMatchObject({
      backup: null,
      saved: false,
      typed: '',
      busy: null,
    });
    await flow.delete();
    expect(options.deleteProject).toHaveBeenCalledTimes(1);
    await flow.download();
    expect(flow.canDelete()).toBe(false);
  });
  it('stale identity cannot retry an uncertain deletion or revive confirmations', async () => {
    const { flow, options, stale } = setup();
    await flow.download();
    flow.confirm(true, 'p', 'reason');
    options.deleteProject.mockRejectedValueOnce(Error('network'));
    await flow.delete();
    stale();
    flow.confirm(true, 'p', 'reason');
    await flow.delete();
    await flow.download();
    expect(options.deleteProject).toHaveBeenCalledTimes(1);
    expect(options.exportProject).toHaveBeenCalledTimes(1);
    expect(flow.canDelete()).toBe(false);
  });
  it('late deletion response cannot navigate or alter a changed account/project', async () => {
    const { flow, options, stale } = setup();
    await flow.download();
    flow.confirm(true, 'p', 'reason');
    let resolve!: (value: object) => void;
    options.deleteProject.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = flow.delete();
    stale();
    resolve({});
    await pending;
    expect(options.onDeleted).not.toHaveBeenCalled();
  });
});
describe('project management integration', () => {
  const editor = readFileSync(
    new URL('../../features/projects/ProjectEditor.tsx', import.meta.url),
    'utf8',
  );
  const panel = readFileSync(
    new URL('../../features/projects/ProjectDeletion.tsx', import.meta.url),
    'utf8',
  );
  const dashboard = readFileSync(
    new URL('../../features/dashboard/Dashboard.tsx', import.meta.url),
    'utf8',
  );
  it('keeps hidden metadata out of deletion and fences project/account revisions', () => {
    expect(editor.indexOf('if (hidden)')).toBeLessThan(
      editor.indexOf('<ProjectDeletion'),
    );
    expect(editor).toContain('ownsVisibleProject(uid, project, hidden)');
    expect(editor).toContain('key={JSON.stringify([uid, projectId, project])}');
    expect(panel).toContain('getAuth(functions.app).currentUser?.uid === uid');
  });
  it('invalidates both caches before navigating to the neutral project list', () => {
    expect(panel.indexOf('projectRepository.invalidate()')).toBeLessThan(
      panel.indexOf('onDeleted();'),
    );
    expect(panel.indexOf('ownRecordsRepository.invalidate()')).toBeLessThan(
      panel.indexOf('onDeleted();'),
    );
    expect(dashboard).toContain(
      "onDeleted={() => navigate('/projects', { replace: true })}",
    );
  });
});
describe('browser JSON download', () => {
  function browser(fail = false) {
    const anchor = {
      href: '',
      download: '',
      click: vi.fn(() => {
        if (fail) throw Error('blocked');
      }),
      remove: vi.fn(),
    };
    const environment = {
      document: {
        createElement: vi.fn(() => anchor),
        body: { appendChild: vi.fn() },
      } as unknown as Document,
      createObjectURL: vi.fn<(blob: Blob) => string>(() => 'blob:backup'),
      revokeObjectURL: vi.fn(),
      defer: vi.fn(),
    };
    return { anchor, environment };
  }
  it('uses a JSON Blob, attached anchor and delayed URL cleanup', async () => {
    const { anchor, environment } = browser();
    downloadProjectJson(backup.exportData, 'p', environment);
    const blob = environment.createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toContain('application/json');
    expect(JSON.parse(await blob.text())).toEqual(backup.exportData);
    expect(environment.document.body.appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.download).toBe('project-backup-p.json');
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(environment.revokeObjectURL).not.toHaveBeenCalled();
    environment.defer.mock.calls[0][0]();
    expect(environment.revokeObjectURL).toHaveBeenCalledWith('blob:backup');
  });
  it('propagates click failure and cleans up without claiming initiation', () => {
    const { anchor, environment } = browser(true);
    expect(() =>
      downloadProjectJson(backup.exportData, 'p', environment),
    ).toThrow('blocked');
    expect(environment.revokeObjectURL).toHaveBeenCalledWith('blob:backup');
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(environment.defer).not.toHaveBeenCalled();
  });
});
