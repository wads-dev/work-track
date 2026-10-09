import { describe, it, expect } from 'vitest';
import { canFinishNow, createFinishNowCommand } from './finish-now';
import { readFileSync } from 'node:fs';
const record = {
  uid: 'owner',
  startedAt: '2026-10-09T09:00:00.000Z',
  updatedAt: 'version',
};
describe('finish now', () => {
  it('only active own missing/null end, never malformed/deleted/foreign', () => {
    expect(canFinishNow(record, 'owner')).toBe(true);
    expect(canFinishNow({ ...record, endedAt: null }, 'owner')).toBe(true);
    for (const extra of [
      { endedAt: '' },
      { endedAt: false },
      { endedAt: '2026-10-09T10:00:00Z' },
      { deletedAt: 0 },
      { uid: 'other' },
      { uid: undefined },
    ])
      expect(canFinishNow({ ...record, ...extra }, 'owner')).toBe(false);
  });
  it('samples click once and retries exact payload/requestId, only current record', async () => {
    const command = createFinishNowCommand();
    const payloads: unknown[] = [];
    let calls = 0;
    const send = async (p: unknown) => {
      payloads.push(p);
      if (calls++ === 0) throw Error('network');
    };
    let clockCalls = 0;
    const clock = () => {
      clockCalls++;
      return '2026-10-09T10:00:00.000Z';
    };
    await expect(
      command.run('current', 'owner', record, send, clock, () => 'stable'),
    ).rejects.toThrow('network');
    await command.run(
      'current',
      'owner',
      record,
      send,
      clock,
      () => 'different',
    );
    expect(clockCalls).toBe(1);
    expect(payloads[0]).toEqual(payloads[1]);
    expect(payloads[0]).toEqual({
      recordId: 'current',
      requestId: 'stable',
      endedAt: '2026-10-09T10:00:00.000Z',
      reason: 'Finalizado agora pelo usuário nos detalhes do registro.',
      expectedUpdatedAt: 'version',
    });
  });
  it('prevents duplicate simultaneous call and rejects before start', async () => {
    const command = createFinishNowCommand();
    let calls = 0;
    let release!: () => void;
    const send = async () => {
      calls++;
      await new Promise<void>((resolve) => (release = resolve));
    };
    const first = command.run(
      'a',
      'owner',
      record,
      send,
      () => '2026-10-09T10:00:00.000Z',
    );
    expect(await command.run('a', 'owner', record, send)).toBe(false);
    release();
    await first;
    expect(calls).toBe(1);
    await expect(
      command.run('a', 'owner', record, send, () => '2026-10-09T08:00:00.000Z'),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
  it('conflict clears intent for explicit subsequent click and latest version', async () => {
    const command = createFinishNowCommand();
    await expect(
      command.run(
        'a',
        'owner',
        record,
        async () => {
          throw { code: 'functions/aborted' };
        },
        () => '2026-10-09T10:00:00.000Z',
        () => 'old',
      ),
    ).rejects.toEqual({ code: 'functions/aborted' });
    let p: unknown;
    await command.run(
      'a',
      'owner',
      { ...record, updatedAt: 'new' },
      async (payload) => {
        p = payload;
      },
      () => '2026-10-09T11:00:00.000Z',
      () => 'new-id',
    );
    expect(p).toMatchObject({
      endedAt: '2026-10-09T11:00:00.000Z',
      requestId: 'new-id',
      expectedUpdatedAt: 'new',
    });
  });
  it('keeps manual editor dirty and disables concurrent editor actions', () => {
    const source = readFileSync(
      new URL('./RecordDrawer.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('!editorDirty.current');
    expect(source).toContain('editorDirty.current = true');
    expect(source).toContain('disabled={finishing || saving');
    expect(source).toContain("'updateRecord'");
    expect(source).not.toContain('closePrevious: true');
  });
});
