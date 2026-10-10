import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { httpsCallable, type Functions } from 'firebase/functions';
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
};
const Context = createContext<Directory>({
  people: [],
  loading: false,
  error: '',
  refresh: () => {},
  name: () => undefined,
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
    const call = httpsCallable<
      { pageSize: number; pageToken?: string },
      CompanyPeoplePage
    >(functions, 'listCompanyPeople');
    void loadCompanyPeople(
      async (input) => (await call(input)).data,
      () => !active,
    )
      .then((people) => {
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
  const byUid = new Map(current.people.map((person) => [person.uid, person]));
  return (
    <Context.Provider
      value={{
        ...current,
        refresh: () => setAttempt((value) => value + 1),
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
