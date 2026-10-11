import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PrivacyContext,
  safeProject,
  safeRecord,
} from '../../shared/ui/privacy';
import { PeoplePage } from './PeoplePage';

const directory = vi.hoisted(() => ({
  people: [
    {
      uid: 'ana-id',
      displayName: 'Ana Silva',
      email: 'ana@wads.dev',
      photoURL: 'https://example.org/ana.jpg',
    },
    {
      uid: 'bruno-id',
      displayName: 'Bruno Lima',
      email: 'bruno@wads.dev',
      photoURL: null,
    },
  ],
  loading: false,
  error: '',
  refresh: vi.fn(),
}));
vi.mock('./CompanyPeopleContext', () => ({
  useCompanyPeople: () => ({
    ...directory,
    person: (uid: string) =>
      directory.people.find((person) => person.uid === uid),
  }),
}));
const render = (revealed = false) =>
  renderToStaticMarkup(
    <PrivacyContext.Provider value={{ revealed }}>
      <PeoplePage />
    </PrivacyContext.Provider>,
  );
beforeEach(() => {
  directory.loading = false;
  directory.error = '';
});

it('keeps the full directory, identities, count and search visible in both confidentiality modes', () => {
  const html = render(false);
  expect(html).toBe(render(true));
  for (const value of [
    'Ana Silva',
    'Bruno Lima',
    'ana@wads.dev',
    'bruno@wads.dev',
    'ana-id',
    'bruno-id',
    'https://example.org/ana.jpg',
    '2 de 2 pessoas',
    'Buscar pessoas por nome, e-mail ou ID',
    'Atualizar',
  ]) {
    expect(html).toContain(value);
  }
  expect(html).not.toContain('Dados das pessoas ocultos');
});

it('still masks confidential project and record content without masking people', () => {
  const project = {
    title: 'Secret project',
    confidential: true,
    topics: ['Secret topic'],
  };
  const record = { uid: 'ana-id', originalText: 'Secret activity' };
  expect(JSON.stringify(safeProject(project, false))).not.toContain('Secret');
  expect(JSON.stringify(safeRecord(record, true))).not.toContain('Secret');
  expect(render(false)).toContain('Ana Silva');
});

it('shows loading and errors instead of a confidentiality gate', () => {
  directory.loading = true;
  expect(render()).toContain('Carregando pessoas');
  expect(render()).toBe(render(true));
  directory.loading = false;
  directory.error = 'Falha ao carregar pessoas';
  expect(render()).toContain(directory.error);
  expect(render()).toContain('Tentar novamente');
  expect(render()).toBe(render(true));
});

it('shows an empty directory in either mode', () => {
  const people = directory.people;
  directory.people = [];
  try {
    expect(render()).toContain('Nenhuma pessoa encontrada na empresa.');
    expect(render()).toBe(render(true));
  } finally {
    directory.people = people;
  }
});
