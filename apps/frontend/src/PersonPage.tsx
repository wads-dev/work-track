import { Link, useParams, useSearchParams } from 'react-router-dom';
import { safeReturnTo } from './routes';
import { useEffect } from 'react';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import { PersonalPage } from './PersonalPage';
export function PersonPage({
  db,
  functions,
  uid,
}: {
  db: Firestore;
  functions: Functions;
  uid: string;
}) {
  const { personId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const matches = params.get('uid') === personId;
  useEffect(() => {
    if (!matches) {
      const next = new URLSearchParams(params);
      next.set('uid', personId);
      next.delete('record');
      setParams(next, { replace: true });
    }
  }, [matches, params, personId, setParams]);
  return (
    <>
      <Link
        className="text-primary underline text-sm"
        to={safeReturnTo(params.get('returnTo'))}
      >
        Voltar ao contexto
      </Link>
      <h2 className="text-2xl font-semibold mb-2">Perfil de pessoa</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Atividades da pessoa selecionada. Para terceiros, somente projetos
        corporativos autorizados; registros pessoais não são consultados.
      </p>
      {matches ? (
        <PersonalPage
          key={uid + personId}
          db={db}
          functions={functions}
          uid={uid}
          calendar
          profile
        />
      ) : (
        <p role="status">Carregando perfil…</p>
      )}
    </>
  );
}
