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
  type CompanyPerson,
  type CompanyPeoplePage,
} from './company-people';
import { createCompanyPeopleRepository } from './company-people-repository';

type Directory = {
  people: CompanyPerson[];
  total: number;
  select: (query?: string) => { people: CompanyPerson[]; total: number };
  loading: boolean;
  error: string;
  refresh: () => void;
  name: (uid: string) => string | undefined;
  person: (uid: string) => CompanyPerson | undefined;
};
const Context = createContext<Directory>({
  people: [],
  total: 0,
  select: () => ({ people: [], total: 0 }),
  loading: false,
  error: '',
  refresh: () => {},
  name: () => undefined,
  person: () => undefined,
});
export function useCompanyPeople(query = '') {
  const directory = useContext(Context);
  return { ...directory, ...directory.select(query) };
}

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
    connection: Functions;
    people: CompanyPerson[];
    loading: boolean;
    error: string;
  }>({
    owner: uid,
    connection: functions,
    people: [],
    loading: true,
    error: '',
  });
  useEffect(() => {
    let active = true;
    setState((previous) => ({
      owner: uid,
      connection: functions,
      people:
        previous.owner === uid && previous.connection === functions
          ? previous.people
          : [],
      loading: true,
      error: '',
    }));
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
        if (active)
          setState({
            owner: uid,
            connection: functions,
            people,
            loading: false,
            error: '',
          });
      })
      .catch(() => {
        if (active)
          setState({
            owner: uid,
            connection: functions,
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
    state.owner === uid && state.connection === functions
      ? state
      : { people: [], loading: true, error: '' };
  traceFirestore('people.memory.read', {
    count: current.people.length,
    loading: current.loading,
    ownerMatches: state.owner === uid,
  });
  const repository = createCompanyPeopleRepository(current.people);
  return (
    <Context.Provider
      value={{
        ...current,
        refresh: () => setAttempt((value) => value + 1),
        total: current.people.length,
        select: repository.select,
        person: repository.read,
        name: repository.name,
      }}
    >
      {children}
    </Context.Provider>
  );
}
