import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Alert,
  AppBar,
  Drawer,
  IconButton,
  Tooltip,
  List,
  ListItemButton,
  ListItemText,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  CssBaseline,
  Stack,
  ThemeProvider,
  Toolbar,
  Typography,
  createTheme,
  useMediaQuery,
} from '@mui/material';
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
import { PendingBell, PendingPage } from './PendingPage';
import { RulesPage } from './RulesPage';
import { UiIcon } from './UiIcons';
import { PersonalPage } from './PersonalPage';

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
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [themeOverride, setThemeOverride] = useState<'light' | 'dark' | null>(
    null,
  );
  const mode = themeOverride ?? (systemDark ? 'dark' : 'light');
  const theme = createTheme({
    palette: {
      mode,
      primary: { main: mode === 'dark' ? '#adc6ff' : '#2457a7' },
      background: {
        default: mode === 'dark' ? '#11151d' : '#f3f6fa',
        paper: mode === 'dark' ? '#1b2230' : '#ffffff',
      },
    },
    shape: { borderRadius: 18 },
    transitions: {
      duration: reducedMotion
        ? {
            shortest: 0,
            shorter: 0,
            short: 0,
            standard: 0,
            complex: 0,
            enteringScreen: 0,
            leavingScreen: 0,
          }
        : {},
    },
    components: {
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background:
              mode === 'dark' ? 'rgba(27,34,48,.9)' : 'rgba(255,255,255,.9)',
            color: mode === 'dark' ? '#e2e8f0' : '#172338',
            backdropFilter: 'blur(12px)',
            borderBottom:
              '1px solid ' + (mode === 'dark' ? '#354055' : '#dce3ef'),
          },
        },
      },
    },
  });
  const toggleTheme = (
    <IconButton
      aria-label={mode === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
      onClick={() => setThemeOverride(mode === 'dark' ? 'light' : 'dark')}
    >
      <UiIcon kind={mode === 'dark' ? 'sun' : 'moon'} />
    </IconButton>
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
            setUser(next);
            setRevealed(false);
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
  return (
    <PrivacyContext.Provider value={{ revealed }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <a className="skip-link" href="#conteudo">
          Ir para o conteúdo
        </a>
        {authorized && services ? (
          <>
            <AppBar position="static" elevation={0}>
              <Toolbar
                sx={{
                  gap: { xs: 0.25, sm: 1 },
                  minHeight: { xs: 60, sm: 64 },
                  px: { xs: 1, sm: 2 },
                  flexWrap: 'nowrap',
                }}
              >
                <IconButton
                  color="inherit"
                  aria-label="Abrir menu de navegação"
                  aria-expanded={menuOpen}
                  aria-controls={menuOpen ? 'menu-principal' : undefined}
                  onClick={() => setMenuOpen(true)}
                >
                  <UiIcon kind="menu" />
                </IconButton>
                <Typography
                  component="h1"
                  variant="h6"
                  noWrap
                  sx={{
                    flexGrow: 1,
                    minWidth: 0,
                    fontSize: { xs: 17, sm: 19 },
                    fontWeight: 600,
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      display: { xs: 'none', sm: 'inline' },
                      color: 'text.secondary',
                      fontWeight: 400,
                    }}
                  >
                    Work Track{' '}
                    <Box component="span" sx={{ mx: 1 }}>
                      ›
                    </Box>
                  </Box>
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
                </Typography>
                <Tooltip title="Alternar tema">{toggleTheme}</Tooltip>
                <PendingBell db={services.db} uid={user.uid} />
                <Tooltip
                  title={
                    revealed
                      ? 'Ocultar dados confidenciais'
                      : 'Revelar dados confidenciais'
                  }
                >
                  <IconButton
                    aria-label={
                      revealed
                        ? 'Ocultar dados confidenciais'
                        : 'Revelar dados confidenciais'
                    }
                    aria-pressed={revealed}
                    onClick={() => setRevealed((value) => !value)}
                  >
                    <UiIcon kind={revealed ? 'eye' : 'eyeoff'} />
                  </IconButton>
                </Tooltip>
                <Typography
                  variant="body2"
                  noWrap
                  sx={{
                    display: { xs: 'none', md: 'block' },
                    ml: 1,
                    maxWidth: 240,
                    color: 'text.secondary',
                  }}
                >
                  {user.email}
                </Typography>
              </Toolbar>
            </AppBar>
            <Drawer open={menuOpen} onClose={() => setMenuOpen(false)}>
              <Box
                component="nav"
                id="menu-principal"
                aria-label="Menu principal"
                sx={{ width: 280, maxWidth: '85vw', p: 2 }}
              >
                <Typography variant="h6">Work Track</Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    overflowWrap: 'anywhere',
                    mb: 2,
                  }}
                >
                  {user.email}
                </Typography>
                <Button onClick={() => setMenuOpen(false)}>Fechar menu</Button>
                <Button onClick={() => setThemeOverride(null)}>
                  Tema do sistema
                </Button>
                <List>
                  {[
                    ['/app', 'Dashboard'],
                    ['/me', 'Meu relatório'],
                    ['/projects', 'Projetos'],
                    ['/records', 'Meus registros'],
                    ['/pending', 'Pendências'],
                    ['/rules', 'Regras'],
                    ['/calendar', 'Calendário'],
                  ].map(([to, label]) => (
                    <ListItemButton
                      key={to}
                      component={RouterLink}
                      to={to}
                      selected={
                        location.pathname === to ||
                        location.pathname.startsWith(to + '/')
                      }
                      onClick={() => setMenuOpen(false)}
                    >
                      <UiIcon
                        kind={
                          to === '/app'
                            ? 'home'
                            : to === '/projects'
                              ? 'projects'
                              : to === '/pending'
                                ? 'bell'
                                : to === '/rules'
                                  ? 'rules'
                                  : 'detail'
                        }
                      />
                      <ListItemText primary={label} sx={{ ml: 2 }} />
                    </ListItemButton>
                  ))}
                </List>
                <Button disabled={busy} onClick={() => void logout()}>
                  Sair
                </Button>
              </Box>
            </Drawer>
            <Container
              component="main"
              id="conteudo"
              tabIndex={-1}
              maxWidth="xl"
              sx={{ py: { xs: 2, sm: 3 } }}
            >
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              <Routes>
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
                    <Alert severity="info">
                      Página não encontrada. Use a navegação para voltar.
                    </Alert>
                  }
                />
              </Routes>
            </Container>
          </>
        ) : (
          <Box
            component="main"
            id="conteudo"
            tabIndex={-1}
            sx={{
              minHeight: '100dvh',
              display: 'grid',
              placeItems: 'center',
              p: 3,
            }}
          >
            <Card sx={{ width: '100%', maxWidth: 440 }}>
              <CardContent sx={{ p: 4 }}>
                <Stack direction="row" sx={{ justifyContent: 'end' }}>
                  {toggleTheme}
                  <Button onClick={() => setThemeOverride(null)}>
                    Tema do sistema
                  </Button>
                </Stack>
                <Stack spacing={3}>
                  <Typography
                    component="h1"
                    variant="h4"
                    sx={{ fontWeight: 700 }}
                  >
                    Work Track
                  </Typography>
                  <Typography color="text.secondary">
                    Acesse projetos e seus registros com sua conta Google
                    verificada @wads.dev.
                  </Typography>
                  {loading && (
                    <Stack direction="row" sx={{ gap: 2 }} role="status">
                      <CircularProgress
                        size={24}
                        aria-label="Carregando sessão"
                      />
                      <span>Carregando sessão…</span>
                    </Stack>
                  )}
                  {error && <Alert severity="error">{error}</Alert>}
                  {!loading && user && !authorized && (
                    <Alert severity="warning">
                      Esta conta não tem acesso. Saia para entrar com uma conta
                      Google verificada @wads.dev.
                    </Alert>
                  )}
                  {!loading &&
                    (user ? (
                      <Button
                        variant="contained"
                        onClick={() => void logout()}
                        disabled={busy}
                      >
                        Sair e trocar conta
                      </Button>
                    ) : (
                      <Button
                        variant="contained"
                        size="large"
                        onClick={() => void login()}
                        disabled={!services || busy}
                      >
                        {busy ? 'Aguardando Google…' : 'Entrar com Google'}
                      </Button>
                    ))}
                  {!loading && !services && (
                    <Button onClick={() => window.location.reload()}>
                      Recarregar configuração
                    </Button>
                  )}
                  <Typography variant="body2" color="text.secondary">
                    Este acesso é independente da autorização MCP em /login.
                    Nenhum registro é criado ao entrar.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Box>
        )}
      </ThemeProvider>
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
