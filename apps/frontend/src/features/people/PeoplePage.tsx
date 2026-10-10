import { useContext, useState } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { useCompanyPeople } from './CompanyPeopleContext';
import { personName } from './company-people';
import { PersonIdentity } from './PersonIdentity';
import { PrivacyContext } from '../../shared/ui/privacy';
import { matchesFilter } from '../../app/routes';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';

export function PeoplePage() {
  const { people, loading, error, refresh } = useCompanyPeople();
  const { revealed } = useContext(PrivacyContext);
  const [filter, setFilter] = useState('');
  const visible = people.filter((person) =>
    matchesFilter([personName(person), person.email, person.uid], filter),
  );
  return (
    <>
      <PageHeader
        title="Pessoas"
        context="Diretório da empresa: contas Google verificadas @wads.dev, incluindo pessoas sem registros de trabalho."
        actions={
          <Button variant="outline" onClick={refresh} disabled={loading}>
            Atualizar
          </Button>
        }
      >
        {revealed && (
          <Input
            className="mt-4"
            aria-label="Buscar pessoas por nome, e-mail ou ID"
            placeholder="Buscar por nome, e-mail ou ID"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        )}
      </PageHeader>
      {!revealed ? (
        <p role="status">
          Dados das pessoas ocultos pelo modo de privacidade. Ative a exibição
          de conteúdo para consultar o diretório.
        </p>
      ) : loading ? (
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
            {visible.length} de {people.length} pessoas
          </p>
          {visible.length === 0 ? (
            <p>
              {people.length
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
