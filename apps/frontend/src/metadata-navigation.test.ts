import { describe, it, expect } from 'vitest';
import { metadataNavigation } from './MetadataLink';
import { safeReturnTo } from './routes';
describe('privacy-aware current catalog navigation', () => {
  it('unknown remains neutral even with reveal; no route title leak or UID fallback', () => {
    for (const revealed of [false, true])
      for (const topic of [undefined, 'secret'])
        expect(
          metadataNavigation('hidden-id', undefined, revealed, topic),
        ).not.toHaveProperty('path');
  });
  it('reserved project/topic have no href until reveal', () => {
    const p = {
      title: 'Confidential Name',
      confidential: true,
      topics: [{ id: 't', title: 'Secret Topic' }],
    };
    expect(metadataNavigation('p', p, false)).toEqual({
      label: 'Projeto reservado',
    });
    expect(metadataNavigation('p', p, false, 't')).toEqual({
      label: 'Tópico reservado',
    });
    expect(metadataNavigation('p', p, true, 't')).toEqual({
      label: 'Secret Topic',
      path: '/projects/p/topics/t',
    });
  });
  it('merged uses canonical catalog name identity not record snapshot', () => {
    const p = {
      title: 'Current',
      topics: [
        { id: 'old', title: 'Obsolete', mergedIntoTopicId: 'new' },
        { id: 'new', title: 'Canonical' },
      ],
    };
    expect(metadataNavigation('p', p, true, 'old')).toEqual({
      label: 'Canonical',
      path: '/projects/p/topics/new',
    });
    expect(metadataNavigation('p', p, true, 'missing')).toEqual({
      label: 'Tópico indisponível',
    });
  });
  it('calendar person subject full-history and report JSON return context survive', () => {
    for (const context of [
      '/calendar?person=all&project=p&subject=t&allWeeks=true&historyPage=1',
      '/me?fromDate=2026-01-01&project=p',
      '/app?project=p',
      '/app?topic=%5B%22p%22%2C%22t%22%5D',
    ])
      expect(safeReturnTo(context)).toBe(context);
  });
});
