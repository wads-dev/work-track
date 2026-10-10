import { personName, personPhoto, type CompanyPerson } from './company-people';
export function resolvePersonIdentity(
  person: CompanyPerson | undefined,
  fallback = 'Pessoa da empresa',
  loading = false,
  uid?: string,
) {
  const safeFallback = fallback.trim();
  const name = person
    ? personName(person)
    : loading
      ? 'Carregando pessoa…'
      : safeFallback && safeFallback !== 'Você' && safeFallback !== uid
        ? safeFallback
        : 'Pessoa da empresa';
  return {
    name,
    photo: person ? personPhoto(person.photoURL) : null,
    initials: name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toLocaleUpperCase('pt-BR'),
  };
}
