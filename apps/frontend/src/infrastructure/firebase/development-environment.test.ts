import { expect, it } from 'vitest';
import { developmentProductionMode } from './development-environment';
it('permits production choice only in loopback development and defaults to demo', () => {
  const prod = { getItem: () => 'production' };
  expect(developmentProductionMode(true, 'localhost', prod)).toBe(true);
  expect(developmentProductionMode(true, '127.0.0.1', prod)).toBe(true);
  expect(developmentProductionMode(false, 'localhost', prod)).toBe(false);
  expect(developmentProductionMode(true, 'wadsworktrack.web.app', prod)).toBe(
    false,
  );
  expect(
    developmentProductionMode(true, 'localhost', { getItem: () => null }),
  ).toBe(false);
  expect(
    developmentProductionMode(true, 'localhost', {
      getItem: () => {
        throw new Error('blocked');
      },
    }),
  ).toBe(false);
});
