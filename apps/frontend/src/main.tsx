import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Alert,
  AppBar,
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

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#2457a7' },
    background: { default: '#f3f6fa' },
  },
  shape: { borderRadius: 12 },
});
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
  const location = useLocation();
  const returnTo = safeReturnTo(
    new URLSearchParams(location.search).get('returnTo'),
  );
  const [services, setServices] = useState<Services | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>
      {authorized && services ? (
        <>
          <AppBar position="static" elevation={0}>
            <Toolbar sx={{ gap: 2, flexWrap: 'wrap', py: 1 }}>
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
          <Container
            component="main"
            id="conteudo"
            tabIndex={-1}
            maxWidth="xl"
            sx={{ py: 4 }}
          >
            <Typography component="h1" variant="h4" sx={{ mb: 1 }}>
              Seu trabalho, com contexto
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 4 }}>
              Projetos da equipe e seus registros de atividade.
            </Typography>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Stack
              component="nav"
              direction="row"
              spacing={1}
              aria-label="Navegação principal"
              sx={{ mb: 3, flexWrap: 'wrap' }}
            >
              {[
                ['/app', 'Visão geral'],
                ['/projects', 'Projetos'],
                ['/records', 'Meus registros'],
              ].map(([to, label]) => (
                <Button
                  key={to}
                  component={RouterLink}
                  to={to}
                  variant={
                    location.pathname === to ||
                    location.pathname.startsWith(to + '/')
                      ? 'contained'
                      : 'outlined'
                  }
                >
                  {label}
                </Button>
              ))}
            </Stack>
            <Routes>
              <Route
                path="/app"
                element={
                  <Dashboard
                    key={user.uid}
                    db={services.db}
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
  );
}
const root = document.getElementById('root');
if (root)
  createRoot(root).render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  );
