import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Alert,
  AppBar,
  Drawer,
  IconButton,
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
import { Dashboard } from './Dashboard';
import './styles.css';
import {
  BrowserRouter,
  Link as RouterLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { safeReturnTo } from './routes';
import { PrivacyContext } from './privacy';
import { PendingBell, PendingPage } from './PendingPage';
import { RulesPage } from './RulesPage';
import { UiIcon } from './UiIcons';

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
      <span aria-hidden="true">{mode === 'dark' ? '☀' : '☾'}</span>
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
              <Toolbar sx={{ gap: 2, flexWrap: 'wrap', py: 1 }}>
                <IconButton
                  color="inherit"
                  aria-label="Abrir menu de navegação"
                  aria-expanded={menuOpen}
                  aria-controls={menuOpen ? 'menu-principal' : undefined}
                  onClick={() => setMenuOpen(true)}
                >
                  <span aria-hidden="true">☰</span>
                </IconButton>
                {toggleTheme}
                <PendingBell db={services.db} uid={user.uid} />
                <Button
                  color="inherit"
                  aria-pressed={revealed}
                  onClick={() => setRevealed((value) => !value)}
                >
                  {revealed ? '◉ Ocultar dados' : '⊘ Modo live: ocultos'}
                </Button>
                <Typography sx={{ flexGrow: 1, fontWeight: 700 }}>
                  Work Track
                </Typography>
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  {user.email}
                </Typography>
                <Button
                  color="inherit"
                  onClick={() => void logout()}
                  disabled={busy}
                >
                  Sair
                </Button>
              </Toolbar>
            </AppBar>
            <Drawer open={menuOpen} onClose={() => setMenuOpen(false)}>
              <Box
                component="nav"
                id="menu-principal"
                aria-label="Menu principal"
                sx={{ width: 280, maxWidth: '85vw', p: 2 }}
              >
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Work Track
                </Typography>
                <Button onClick={() => setMenuOpen(false)}>Fechar menu</Button>
                <Button onClick={() => setThemeOverride(null)}>
                  Tema do sistema
                </Button>
                <List>
                  {[
                    ['/app', 'Visão geral'],
                    ['/projects', 'Projetos'],
                    ['/records', 'Meus registros'],
                    ['/pending', 'Pendências'],
                    ['/rules', 'Regras do relatório'],
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
                          to === '/rules'
                            ? 'rules'
                            : to === '/pending'
                              ? 'bell'
                              : to === '/projects'
                                ? 'projects'
                                : to === '/app'
                                  ? 'home'
                                  : 'detail'
                        }
                      />
                      <ListItemText primary={label} sx={{ ml: 2 }} />
                    </ListItemButton>
                  ))}
                </List>
              </Box>
            </Drawer>
            <Container
              component="main"
              id="conteudo"
              tabIndex={-1}
              maxWidth="xl"
              sx={{ py: 4 }}
            >
              <Typography component="h1" variant="h4" sx={{ mb: 1 }}>
                Dashboard
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 4 }}>
                Projetos da equipe e seus registros de atividade.
              </Typography>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              <Routes>
                <Route path="/rules" element={<RulesPage />} />
                <Route
                  path="/pending"
                  element={
                    <PendingPage
                      key={user.uid}
                      db={services.db}
                      uid={user.uid}
                    />
                  }
                />
                <Route
                  path="/app"
                  element={
                    <Dashboard
                      key={user.uid}
                      db={services.db}
                      functions={services.functions}
                      uid={user.uid}
                      mode="overview"
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
