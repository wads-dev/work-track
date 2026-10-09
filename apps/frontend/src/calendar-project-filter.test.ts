import { describe, expect, it } from 'vitest';
import {
  calendarProjectOptions,
  updatePersonalFilters,
} from './calendar-project-filter';

describe('calendar project filter', () => {
  it('offers all projects and keeps identical titles distinct by id', () => {
    const options = calendarProjectOptions(
      [
        { id: 'work', label: 'Atlas' },
        { id: 'personal', label: 'Atlas' },
      ],
      'personal',
    );
    expect(options.map((p) => p.id)).toEqual(['', 'work', 'personal']);
    expect(options[0].label).toBe('Todos os projetos');
  });
  it('does not silently remove an unavailable selection or reveal its id as label', () => {
    const options = calendarProjectOptions([], 'foreign-or-archived');
    expect(options[1]).toEqual({
      id: 'foreign-or-archived',
      label: 'Projeto reservado',
    });
  });
  it('selects by stable id and preserves period, density and archived state', () => {
    const initial = new URLSearchParams(
      'date=2026-10-09&view=week&density=compact&includeArchived=true&cursor=old',
    );
    const selected = updatePersonalFilters(initial, 'projectId', 'atlas');
    expect(selected.get('projectId')).toBe('atlas');
    expect(selected.get('date')).toBe('2026-10-09');
    expect(selected.get('view')).toBe('week');
    expect(selected.get('density')).toBe('compact');
    expect(selected.get('includeArchived')).toBe('true');
    expect(selected.has('cursor')).toBe(false);
    expect(initial.has('projectId')).toBe(false);
    expect(new URLSearchParams(selected.toString()).get('projectId')).toBe(
      'atlas',
    );
  });
  it('keeps project when navigating date or changing day/week/month view', () => {
    let next = new URLSearchParams('projectId=atlas&date=2026-10-09&view=week');
    next = updatePersonalFilters(next, 'date', '2026-10-16');
    for (const view of ['day', 'week', 'month']) {
      next = updatePersonalFilters(next, 'view', view);
      expect(next.get('projectId')).toBe('atlas');
      expect(next.get('date')).toBe('2026-10-16');
      expect(next.get('density')).toBe(
        view === 'month' ? 'supercompact' : 'timeline',
      );
    }
  });
  it('clears only project when returning to all', () => {
    const next = updatePersonalFilters(
      new URLSearchParams('projectId=atlas&date=2026-10-09&view=week'),
      'projectId',
      '',
    );
    expect(next.has('projectId')).toBe(false);
    expect(next.get('view')).toBe('week');
    expect(next.get('date')).toBe('2026-10-09');
  });
});
