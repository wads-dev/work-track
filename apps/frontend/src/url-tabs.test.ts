import { describe, it, expect } from 'vitest';
import { readUrlTab, writeUrlTab, tabLocation } from './url-tabs';
describe('URL tabs', () => {
  it('normalizes absent/invalid deterministically', () => {
    for (const value of ['', 'tab=bad'])
      expect(
        readUrlTab(
          new URLSearchParams(value),
          'tab',
          ['overview', 'details'],
          'overview',
        ),
      ).toBe('overview');
    expect(
      readUrlTab(
        new URLSearchParams('recordTab=history'),
        'recordTab',
        ['details', 'edit', 'history'],
        'details',
      ),
    ).toBe('history');
  });
  it('preserves all unrelated parameters without mutating original', () => {
    const p = new URLSearchParams(
      'project=p&from=2026-01-01&to=2026-02-01&view=week&density=compact&date=2026-01-05&record=r&returnTo=%2Fpending%3Fproject%3Dp&search=a',
    );
    const next = writeUrlTab(p, 'recordTab', 'edit');
    for (const [key, value] of p) expect(next.get(key)).toBe(value);
    expect(p.has('recordTab')).toBe(false);
    expect(next.get('recordTab')).toBe('edit');
  });
  it('preserves pathname hash and allows history values to replay', () => {
    const initial = {
      pathname: '/projects/p',
      search: '?project=p&tab=overview',
      hash: '#summary',
    };
    const next = tabLocation(initial, 'tab', 'details');
    expect(next).toBe('/projects/p?project=p&tab=details#summary');
    expect(
      readUrlTab(
        new URL(next, 'https://example.test').searchParams,
        'tab',
        ['overview', 'details'],
        'overview',
      ),
    ).toBe('details');
    expect(
      readUrlTab(
        new URLSearchParams(initial.search),
        'tab',
        ['overview', 'details'],
        'overview',
      ),
    ).toBe('overview');
  });
});
