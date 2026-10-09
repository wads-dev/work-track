import { expect, it } from 'vitest';
import { selectPrevious } from './close-previous.js';
import { registerInput } from './work-model.js';
const previous = {
  id: 'one',
  uid: 'alice',
  projectId: 'p',
  startedAt: '2026-10-08T10:00:00Z',
};
it('selects only a unique own open same-project predecessor; ambiguity requires ID', () => {
  expect(
    selectPrevious([previous], 'alice', 'p', '2026-10-08T11:00:00Z')?.id,
  ).toBe('one');
  const second = { ...previous, id: 'two' };
  expect(() =>
    selectPrevious([previous, second], 'alice', 'p', '2026-10-08T11:00:00Z'),
  ).toThrow('Múltiplos');
  expect(
    selectPrevious(
      [previous, second],
      'alice',
      'p',
      '2026-10-08T11:00:00Z',
      'two',
    )?.id,
  ).toBe('two');
  expect(() =>
    selectPrevious([previous], 'bob', 'p', '2026-10-08T11:00:00Z', 'one'),
  ).toThrow('próprio');
  expect(
    selectPrevious([previous], 'alice', 'other', '2026-10-08T11:00:00Z'),
  ).toBeUndefined();
});
it('requires reason and an explicit opt-in, default leaves previous open', () => {
  const input = {
    projectId: 'p',
    startedAt: '2026-10-08T11:00:00Z',
    timeZone: 'UTC',
    originalText: 'new',
    interpretation: 'new',
    requestId: 'new',
  };
  expect(registerInput.parse(input).closePrevious).toBeUndefined();
  expect(
    registerInput.safeParse({ ...input, closePrevious: true }).success,
  ).toBe(false);
  expect(
    registerInput.safeParse({ ...input, closedPreviousRecordId: 'one' })
      .success,
  ).toBe(false);
  expect(
    registerInput.safeParse({
      ...input,
      closePrevious: true,
      closePreviousReason: 'Human confirmed',
    }).success,
  ).toBe(true);
});
