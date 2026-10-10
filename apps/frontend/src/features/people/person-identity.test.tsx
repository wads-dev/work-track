import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrivacyContext } from '../../shared/ui/privacy';
import { PersonIdentity } from './PersonIdentity';
import { resolvePersonIdentity } from './person-identity';
const directory = vi.hoisted(() => ({
  loading: false,
  person: {
    uid: 'user-id',
    displayName: 'Ana Silva',
    email: 'ana@wads.dev',
    photoURL: 'https://example.org/ana.jpg',
  },
}));
vi.mock('./CompanyPeopleContext', () => ({
  useCompanyPeople: () => ({
    loading: directory.loading,
    person: (uid: string) =>
      uid === directory.person.uid ? directory.person : undefined,
  }),
}));
const render = (uid = 'user-id', revealed = true, label?: string) =>
  renderToStaticMarkup(
    <PrivacyContext.Provider value={{ revealed }}>
      <PersonIdentity uid={uid} fallback={uid} label={label} />
    </PrivacyContext.Provider>,
  );
describe('person identity', () => {
  it('avatar-only mode retains the accessible name without visible text', () => {
    const html = renderToStaticMarkup(
      <PrivacyContext.Provider value={{ revealed: true }}>
        <PersonIdentity uid="user-id" avatarOnly />
      </PrivacyContext.Provider>,
    );
    expect(html).toContain('class="sr-only">Ana Silva</span>');
    expect(html).toContain('https://example.org/ana.jpg');
  });
  it('resolves UID into name and safe photo without showing UID or Você', () => {
    const html = render();
    expect(html).toContain('Ana Silva');
    expect(html).toContain('https://example.org/ana.jpg');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).not.toContain('user-id');
    expect(html).not.toContain('Você');
  });
  it('keeps Meu calendário caption with own photo', () => {
    const html = render('user-id', true, 'Meu calendário');
    expect(html).toContain('Meu calendário');
    expect(html).toContain('https://example.org/ana.jpg');
  });
  it('does not expose name, photo or UID in privacy mode', () => {
    const html = render('user-id', false);
    expect(html).toBe('<span>Pessoa</span>');
  });
  it('never uses raw UID or Você as fallback', () => {
    expect(render('unknown-id')).not.toContain('unknown-id');
    expect(resolvePersonIdentity(undefined, 'Você').name).toBe(
      'Pessoa da empresa',
    );
  });
  it('uses email fallback and initials without unsafe photo URLs', () => {
    expect(
      resolvePersonIdentity({
        ...directory.person,
        displayName: null,
        photoURL: 'javascript:bad',
      }),
    ).toMatchObject({ name: 'ana@wads.dev', photo: null });
    expect(resolvePersonIdentity(directory.person).initials).toBe('AS');
  });
  it('renders loading and missing profile gracefully', () => {
    directory.loading = true;
    expect(render('unknown')).toContain('Carregando pessoa');
    directory.loading = false;
    expect(render('unknown')).toContain('Pessoa da empresa');
  });
});
