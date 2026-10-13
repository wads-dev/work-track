import { createCallable } from '../../infrastructure/firebase/callable-command-gateway';
import { traceFirestore } from '../../data/sync/firestore-diagnostics';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Functions } from 'firebase/functions';
import {
  loadCompanyPeople,
  personName,
  type CompanyPerson,
  type CompanyPeoplePage,
} from './company-people';

type Directory = {
  people: CompanyPerson[];
  loading: boolean;
  error: string;
  refresh: () => void;
  name: (uid: string) => string | undefined;
  person: (uid: string) => CompanyPerson | undefined;
};
const Context = createContext<Directory>({
  people: [],
  loading: false,
  error: '',
  refresh: () => {},
  name: () => undefined,
  person: () => undefined,
});
export const useCompanyPeople = () => useContext(Context);

export function CompanyPeopleProvider({
  functions,
  uid,
  children,
}: {
  functions: Functions;
  uid: string;
  children: ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    owner: string;
    people: CompanyPerson[];
    loading: boolean;
    error: string;
  }>({ owner: uid, people: [], loading: true, error: '' });
  useEffect(() => {
    let active = true;
    setState({ owner: uid, people: [], loading: true, error: '' });
    const call = createCallable<
      { pageSize: number; pageToken?: string },
      CompanyPeoplePage
    >(functions, 'listCompanyPeople');
    traceFirestore('people.remote.start', { name: 'listCompanyPeople' });
    void loadCompanyPeople(
      async (input) => {
        const result = await call(input);
        traceFirestore('people.remote.page', {
          count: result.data.people.length,
        });
        return result.data;
      },
      () => !active,
    )
      .then((people) => {
        traceFirestore('people.remote.result', {
          count: people.length,
          active,
        });
        if (active) setState({ owner: uid, people, loading: false, error: '' });
      })
      .catch(() => {
        if (active)
          setState({
            owner: uid,
            people: [],
            loading: false,
            error: 'Não foi possível carregar as pessoas. Tente novamente.',
          });
      });
    return () => {
      active = false;
    };
  }, [functions, uid, attempt]);
  const current =
    state.owner === uid ? state : { people: [], loading: true, error: '' };
  traceFirestore('people.memory.read', {
    count: current.people.length,
    loading: current.loading,
    ownerMatches: state.owner === uid,
  });
  const byUid = new Map(current.people.map((person) => [person.uid, person]));
  return (
    <Context.Provider
      value={{
        ...current,
        refresh: () => setAttempt((value) => value + 1),
        person: (id) => byUid.get(id),
        name: (id) => {
          const person = byUid.get(id);
          return person ? personName(person) : undefined;
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
