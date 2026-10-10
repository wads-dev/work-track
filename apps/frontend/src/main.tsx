import { ownRecordsRepository } from './own-records-repository';
import { deletionAccount } from './record-deletion';
import { useEffect, useState } from 'react';
import { projectRepository } from './project-repository';
import { TopicDetails } from './TopicDetails';
import { createRoot } from 'react-dom/client';
import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { Alert, AlertDescription } from './components/ui/alert';
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from './components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from './components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from './components/ui/sheet';
import { cn } from './lib/utils';
import { useMediaQuery } from './theme';

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { initializeServices, type Services } from './firebase';
import { RecordDrawer } from './RecordDrawer';
import { Dashboard } from './Dashboard';
import '@fontsource-variable/geist';
import './styles.css';
import {
  BrowserRouter,
  Link as RouterLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { safeReturnTo } from './routes';
import { PrivacyContext } from './privacy';
import {
  readPrivacyPreference,
  savePrivacyPreference,
} from './privacy-preference';
import { PendingBell, PendingPage } from './PendingPage';
import { RulesPage } from './RulesPage';
import { UiIcon } from './UiIcons';
import { PersonalPage } from './PersonalPage';
import { PersonPage } from './PersonPage';
import { PeoplePage } from './PeoplePage';
import { CompanyPeopleProvider } from './CompanyPeopleContext';
import { PwaControls } from './PwaControls';

function allowed(user: User) {
  return (
    user.emailVerified &&
    !!user.email?.toLowerCase().endsWith('@wads.dev') &&
    user.providerData.some((provider) => provider.providerId === 'google.com')
  );
}
function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    if (error.code === 'auth/popup-closed-by-user')
      return 'Login cancelado. Tente novamente quando quiser.';
    if (error.code === 'auth/popup-blocked')
      return 'Permita pop-ups neste site para entrar com Google.';
    if (error.code === 'auth/unauthorized-domain')
      return 'Este domínio não está autorizado para o login Google.';
  }
  return error instanceof Error
    ? error.message
    : 'Não foi possível concluir a operação. Tente novamente.';
}
function RecordPage({ services, uid }: { services: Services; uid: string }) {
  const { recordId } = useParams();
  return recordId ? (
    <RecordDrawer
      db={services.db}
      functions={services.functions}
      uid={uid}
      recordId={recordId}
      search=""
      presentation="page"
    />
  ) : null;
}
function App() {
  const [revealed, setRevealed] = useState(false);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [themeOverride, setThemeOverride] = useState<'light' | 'dark' | null>(
    null,
  );
  const mode = themeOverride ?? (systemDark ? 'dark' : 'light');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', mode === 'dark');
    document.documentElement.style.colorScheme = mode;
  }, [mode]);
  const toggleTheme = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Escolher tema">
          <UiIcon kind={mode === 'dark' ? 'sun' : 'moon'} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={themeOverride ?? 'system'}
          onValueChange={(value) =>
            setThemeOverride(
              value === 'system' ? null : (value as 'light' | 'dark'),
            )
          }
        >
          <DropdownMenuRadioItem value="system">Sistema</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="light">Claro</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Escuro</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const location = useLocation();
  const returnTo = safeReturnTo(
    new URLSearchParams(location.search).get('returnTo'),
  );
  const [services, setServices] = useState<Services | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void initializeServices()
      .then((result) => {
        if (!active) return;
        setServices(result);
        unsubscribe = onAuthStateChanged(
          result.auth,
          (next) => {
            if (!active) return;
            projectRepository.account(next?.uid ?? '');
            deletionAccount(next?.uid ?? '');
            ownRecordsRepository.account(next?.uid ?? '');
            setUser(next);
            setRevealed(readPrivacyPreference(next?.uid ?? ''));
            setLoading(false);
          },
          (failure) => {
            if (active) {
              setError(errorMessage(failure));
              setLoading(false);
            }
          },
        );
      })
      .catch((failure) => {
        if (active) {
          setError(errorMessage(failure));
          setLoading(false);
        }
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  async function login() {
    if (!services) return;
    setBusy(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        hd: 'wads.dev',
        prompt: 'select_account',
      });
      const result = await signInWithPopup(services.auth, provider);
      if (!allowed(result.user)) {
        projectRepository.account('');
        deletionAccount('');
        ownRecordsRepository.account('');
        await signOut(services.auth);
        setError('Use uma conta Google verificada @wads.dev.');
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (!services) return;
    setBusy(true);
    setError('');
    try {
      projectRepository.account('');
      await signOut(services.auth);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  const authorized = user && allowed(user);
  if (!loading && !authorized && location.pathname !== '/') {
    const target = location.pathname + location.search + location.hash;
    return (
      <Navigate
        replace
        to={'/?returnTo=' + encodeURIComponent(safeReturnTo(target))}
      />
    );
  }
  if (!loading && authorized && location.pathname === '/')
    return <Navigate replace to={returnTo} />;
  const navigation = (
    <nav
      id="menu-principal"
      aria-label="Menu principal"
      className="flex h-full flex-col gap-2 p-5"
    >
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <img src="/brand.svg" alt="" className="size-10" />
          <h2 className="text-xl font-semibold tracking-tight">Work Track</h2>
        </div>
        <PwaControls />
        <p className="mt-1 text-sm text-muted-foreground">
          Projetos, tempo e contexto
        </p>
      </div>
      <p className="px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Trabalho e gestão
      </p>
      <div className="flex flex-1 flex-col gap-1">
        {(
          [
            ['/app', 'Dashboard', 'home'],
            ['/me', 'Meu relatório', 'chart'],
            ['/calendar', 'Calendário', 'calendar'],
            ['/projects', 'Projetos', 'projects'],
            ['/people', 'Pessoas', 'people'],
            ['/records', 'Meus registros', 'records'],
            ['/pending', 'Pendências', 'bell'],
            ['/rules', 'Regras', 'rules'],
          ] as const
        ).map(([to, label, kind]) => {
          const active =
            location.pathname === to || location.pathname.startsWith(to + '/');
          return (
            <RouterLink
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
                active && 'bg-accent text-accent-foreground',
              )}
            >
              <UiIcon kind={kind} />
              {label}
            </RouterLink>
          );
        })}
      </div>
      <p className="break-all px-3 text-xs text-muted-foreground">
        {user?.email}
      </p>
      <Button variant="outline" disabled={busy} onClick={() => void logout()}>
        Sair
      </Button>
    </nav>
  );
  return (
    <PrivacyContext.Provider value={{ revealed }}>
      <TooltipProvider>
        <a className="skip-link" href="#conteudo">
          Ir para o conteúdo
        </a>
        {authorized && services ? (
          <>
            <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-sidebar text-sidebar-foreground lg:block">
              {navigation}
            </aside>
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="sr-only">Navegação</SheetTitle>
                <SheetDescription className="sr-only">
                  Menu principal do Work Track
                </SheetDescription>
                {navigation}
              </SheetContent>
            </Sheet>
            <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/95 px-6 backdrop-blur lg:ml-64">
              <Button
                className="lg:hidden"
                variant="ghost"
                size="icon"
                aria-label="Abrir menu de navegação"
                aria-expanded={menuOpen}
                aria-controls="menu-principal"
                onClick={() => setMenuOpen(true)}
              >
                <UiIcon kind="menu" />
              </Button>
              <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
                <span className="mr-3 font-normal text-muted-foreground">
                  Work Track <span className="ml-2">›</span>
                </span>
                {location.pathname.startsWith('/projects')
                  ? 'Projetos'
                  : location.pathname.startsWith('/records')
                    ? 'Meus registros'
                    : location.pathname === '/calendar'
                      ? 'Calendário'
                      : location.pathname === '/pending'
                        ? 'Pendências'
                        : location.pathname === '/rules'
                          ? 'Regras'
                          : location.pathname === '/me'
                            ? 'Meu relatório'
                            : 'Dashboard'}
              </h1>
              {toggleTheme}
              <PendingBell db={services.db} uid={user.uid} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={
                      revealed
                        ? 'Ocultar dados confidenciais'
                        : 'Revelar dados confidenciais'
                    }
                    aria-pressed={revealed}
                    onClick={() => {
                      const next = !revealed;
                      savePrivacyPreference(user.uid, next);
                      setRevealed(next);
                    }}
                  >
                    <UiIcon kind={revealed ? 'eye' : 'eyeoff'} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {revealed
                    ? 'Ocultar dados confidenciais'
                    : 'Revelar dados confidenciais'}
                </TooltipContent>
              </Tooltip>
            </header>
            <main id="conteudo" tabIndex={-1} className="min-w-0 p-6 lg:ml-64">
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <CompanyPeopleProvider
                key={user.uid}
                functions={services.functions}
                uid={user.uid}
              >
                <Routes>
                  <Route path="/people" element={<PeoplePage />} />
                  <Route
                    path="/people/:personId"
                    element={
                      <PersonPage
                        key={user.uid}
                        db={services.db}
                        functions={services.functions}
                        uid={user.uid}
                      />
                    }
                  />
                  <Route
                    path="/me"
                    element={
                      <PersonalPage
                        key={user.uid}
                        db={services.db}
                        functions={services.functions}
                        uid={user.uid}
                      />
                    }
                  />
                  <Route path="/rules" element={<RulesPage />} />
                  <Route
                    path="/pending"
                    element={
                      <PendingPage
                        functions={services.functions}
                        key={user.uid}
                        db={services.db}
                        uid={user.uid}
                      />
                    }
                  />
                  <Route
                    path="/app"
                    element={
                      <PersonalPage
                        company
                        key={user.uid}
                        db={services.db}
                        functions={services.functions}
                        uid={user.uid}
                      />
                    }
                  />
                  <Route
                    path="/calendar"
                    element={
                      <PersonalPage
                        key={user.uid}
                        db={services.db}
                        functions={services.functions}
                        uid={user.uid}
                        calendar
                      />
                    }
                  />
                  <Route
                    path="/projects"
                    element={
                      <Dashboard
                        key={user.uid}
                        db={services.db}
                        functions={services.functions}
                        uid={user.uid}
                        mode="projects"
                      />
                    }
                  />
                  <Route
                    path="/projects/:projectId/topics/:topicId"
                    element={
                      <TopicDetails
                        key={user.uid}
                        functions={services.functions}
                        uid={user.uid}
                      />
                    }
                  />
                  <Route
                    path="/projects/:projectId"
                    element={
                      <Dashboard
                        key={user.uid}
                        db={services.db}
                        functions={services.functions}
                        uid={user.uid}
                        mode="projects"
                      />
                    }
                  />
                  <Route
                    path="/records"
                    element={
                      <Dashboard
                        key={user.uid}
                        db={services.db}
                        functions={services.functions}
                        uid={user.uid}
                        mode="records"
                      />
                    }
                  />
                  <Route
                    path="/records/:recordId"
                    element={<RecordPage services={services} uid={user.uid} />}
                  />
                  <Route
                    path="*"
                    element={
                      <Alert>
                        Página não encontrada. Use a navegação para voltar.
                      </Alert>
                    }
                  />
                </Routes>
              </CompanyPeopleProvider>
            </main>
          </>
        ) : (
          <main
            id="conteudo"
            tabIndex={-1}
            className="relative flex min-h-screen items-center justify-center p-6"
          >
            <div className="absolute right-6 top-4">{toggleTheme}</div>
            <Card className="w-full max-w-md">
              <CardContent className="space-y-6 pt-6">
                <div>
                  <img src="/brand.svg" alt="" className="mb-4 size-16" />
                  <h1 className="text-3xl font-semibold tracking-tight">
                    Work Track
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Projetos, tempo e contexto da WADS.
                  </p>
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {loading ? (
                  <div
                    role="status"
                    aria-label="Carregando autenticação"
                    className="flex justify-center py-4"
                  >
                    <span className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
                  </div>
                ) : (
                  <Button
                    className="w-full"
                    disabled={busy || !services}
                    onClick={() => void login()}
                  >
                    {busy ? 'Entrando…' : 'Entrar com Google'}
                  </Button>
                )}
                <PwaControls />
                <p className="text-xs text-muted-foreground">
                  Use sua conta Google corporativa @wads.dev. Nenhum registro é
                  criado ao entrar.
                </p>
              </CardContent>
            </Card>
          </main>
        )}
      </TooltipProvider>
    </PrivacyContext.Provider>
  );
}
const root = document.getElementById('root');
if (root)
  createRoot(root).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  );
