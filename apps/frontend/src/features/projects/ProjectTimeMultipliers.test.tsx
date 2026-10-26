import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Functions } from 'firebase/functions';
vi.mock('../people/CompanyPeopleContext', () => ({
  useCompanyPeople: () => ({
    people: [{ uid: 'alice' }],
    name: () => 'Alice',
    person: () => ({ uid: 'alice', displayName: 'Alice' }),
    loading: false,
    error: '',
  }),
}));
vi.mock('../../components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: import('react').ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock('../../components/ui/input', () => ({
  Input: (props: import('react').InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));
vi.mock('../../components/ui/alert', () => ({
  Alert: ({ children }: { children: import('react').ReactNode }) => (
    <div>{children}</div>
  ),
}));
import {
  ProjectTimeMultipliers,
  parseMultiplierRows,
} from './ProjectTimeMultipliers';
it('converts empty vigency to timeless base and preserves explicit offsets and zero', () => {
  expect(
    parseMultiplierRows([
      { userId: 'alice', multiplier: '0', effectiveFrom: '' },
      {
        userId: 'alice',
        multiplier: '1.5',
        effectiveFrom: '2026-01-01T00:00:00-03:00',
      },
    ]),
  ).toEqual({
    alice: [
      { multiplier: 0, effectiveFrom: null },
      { multiplier: 1.5, effectiveFrom: '2026-01-01T00:00:00-03:00' },
    ],
  });
});
it('rejects duplicate instants, ambiguous local dates and invalid factors', () => {
  for (const multiplier of ['', '-1', 'Infinity', 'NaN'])
    expect(() =>
      parseMultiplierRows([{ userId: 'alice', multiplier, effectiveFrom: '' }]),
    ).toThrow();
  expect(() =>
    parseMultiplierRows([
      {
        userId: 'alice',
        multiplier: '1',
        effectiveFrom: '2026-01-01T00:00:00',
      },
    ]),
  ).toThrow();
  expect(() =>
    parseMultiplierRows([
      { userId: 'alice', multiplier: '1', effectiveFrom: '' },
      { userId: 'alice', multiplier: '2', effectiveFrom: '' },
    ]),
  ).toThrow();
});
it('uses visible directory identities and explains the original-start rule', () => {
  const html = renderToStaticMarkup(
    <ProjectTimeMultipliers
      functions={{} as Functions}
      projectId="p"
      project={{
        timeMultipliers: { alice: [{ multiplier: 2, effectiveFrom: null }] },
      }}
    />,
  );
  expect(html).toContain('Alice');
  expect(html).toContain('início original');
  expect(html).toContain('base atemporal');
  expect(html).toContain('2026-01-01T00:00:00-03:00');
});
