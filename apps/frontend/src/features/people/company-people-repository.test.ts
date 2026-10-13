import { expect, it } from 'vitest';
import { createCompanyPeopleRepository } from './company-people-repository';
it('selects complete Auth directory names/email/IDs within repository independently of project privacy', () => {
  const people = [
    {
      uid: 'a',
      displayName: 'Ana Silva',
      email: 'ana@wads.dev',
      photoURL: null,
    },
    { uid: 'b', displayName: null, email: 'bruno@wads.dev', photoURL: null },
  ];
  const repo = createCompanyPeopleRepository(people);
  expect(repo.select('ANA').people.map((p) => p.uid)).toEqual(['a']);
  expect(repo.select('@wads').total).toBe(2);
  expect(repo.select('b').people.map((p) => p.uid)).toEqual(['b']);
  expect(repo.read('b')).toBe(people[1]);
  expect(repo.name('a')).toBe('Ana Silva');
  expect(repo.read('missing')).toBeUndefined();
  expect(createCompanyPeopleRepository([]).select()).toEqual({
    people: [],
    total: 0,
  });
});
