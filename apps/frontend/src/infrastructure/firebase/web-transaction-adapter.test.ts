import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { canonical, hash } from './web-transaction-adapter';
it('SHA256 preview fingerprints preserve full canonical evidence across browser and backend', () => {
  for (const value of [
    '',
    'a'.repeat(1000),
    {
      b: 2,
      a: [
        'ação',
        { uid: 'owner', originalText: 'texto original', updatedAt: null },
      ],
    },
  ])
    expect(hash(value)).toBe(
      createHash('sha256').update(canonical(value)).digest('hex'),
    );
  expect(hash({ a: 1, b: 2 })).toBe(hash({ b: 2, a: 1 }));
  expect(hash({ originalText: 'antes' })).not.toBe(
    hash({ originalText: 'depois' }),
  );
});
