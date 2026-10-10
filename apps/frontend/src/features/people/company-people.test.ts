import { describe, expect, it, vi } from 'vitest';
import {
  loadCompanyPeople,
  personName,
  personPhoto,
  type CompanyPerson,
} from './company-people';
const person = (uid: string, name: string | null = null): CompanyPerson => ({
  uid,
  displayName: name,
  email: uid + '@wads.dev',
  photoURL: null,
});
describe('company people directory', () => {
  it('continues through empty filtered pages and deduplicates, sorting by name', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ people: [], nextPageToken: 'second' })
      .mockResolvedValueOnce({
        people: [person('a', 'Zoe')],
        nextPageToken: 'third',
      })
      .mockResolvedValueOnce({
        people: [person('a', 'Ana'), person('b', 'Bruno')],
        nextPageToken: null,
      });
    expect((await loadCompanyPeople(fetch)).map((p) => p.displayName)).toEqual([
      'Ana',
      'Bruno',
    ]);
    expect(fetch.mock.calls).toEqual([
      [{ pageSize: 100 }],
      [{ pageSize: 100, pageToken: 'second' }],
      [{ pageSize: 100, pageToken: 'third' }],
    ]);
  });
  it('falls back to email when a name is missing or blank', () => {
    expect(personName(person('a'))).toBe('a@wads.dev');
    expect(personName(person('a', '  '))).toBe('a@wads.dev');
    expect(personName(person('a', ' Ana '))).toBe('Ana');
  });
  it('allows only HTTPS photos', () => {
    expect(personPhoto('https://example.org/avatar.png')).toBe(
      'https://example.org/avatar.png',
    );
    for (const value of [
      null,
      'bad',
      'http://example.org',
      'javascript:alert(1)',
      'data:image/png;base64,a',
    ])
      expect(personPhoto(value)).toBeNull();
  });
  it('does not return a partial directory on errors', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ people: [person('a')], nextPageToken: 'second' })
      .mockRejectedValueOnce(new Error('network'));
    await expect(loadCompanyPeople(fetch)).rejects.toThrow('network');
  });
  it('rejects repeated page tokens', async () => {
    await expect(
      loadCompanyPeople(async () => ({ people: [], nextPageToken: 'same' })),
    ).rejects.toThrow('Paginação');
  });
  it('stops fetching after account unmount or refresh', async () => {
    let cancelled = false;
    const fetch = vi.fn().mockImplementation(async () => {
      cancelled = true;
      return { people: [person('old')], nextPageToken: 'second' };
    });
    expect(await loadCompanyPeople(fetch, () => cancelled)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
