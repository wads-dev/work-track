import { useState } from 'react';
import { CompactListToolbar } from '../../shared/ui/CompactListToolbar';
import { useCompanyPeople } from './CompanyPeopleContext';
import { PersonIdentity } from './PersonIdentity';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';

export function PeoplePage() {
  const [filter, setFilter] = useState('');
  const {
    people: visible,
    total,
    loading,
    error,
    refresh,
  } = useCompanyPeople(filter);
  return (
    <>
      <CompactListToolbar
        label="Filtros de pessoas"
        searchLabel="Buscar pessoas por nome, e-mail ou ID"
        searchPlaceholder="Pesquisar pessoas por nome, e-mail ou ID…"
        search={filter}
        onSearchChange={setFilter}
        actionLabel="Atualizar pessoas"
        onAction={refresh}
        disabled={loading}
      />
      {loading ? (
        <p role="status">Carregando pessoas…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {error}{' '}
            <Button variant="outline" onClick={refresh}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <p role="status" className="mb-4 text-sm text-muted-foreground">
            {visible.length} de {total} pessoas
          </p>
          {visible.length === 0 ? (
            <p>
              {total
                ? 'Nenhuma pessoa corresponde à busca.'
                : 'Nenhuma pessoa encontrada na empresa.'}
            </p>
          ) : (
            <ul
              aria-label="Pessoas da empresa"
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {visible.map((person) => (
                <li key={person.uid}>
                  <Card className="h-full">
                    <CardContent className="flex gap-4 pt-6">
                      <div className="min-w-0">
                        <h2 className="break-words font-semibold">
                          <PersonIdentity uid={person.uid} />
                        </h2>
                        <p className="break-all text-sm text-muted-foreground">
                          {person.email}
                        </p>
                        <p className="mt-2 break-all text-xs text-muted-foreground">
                          ID: <code className="select-all">{person.uid}</code>
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
