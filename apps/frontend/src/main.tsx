import { ownRecordsRepository } from './own-records-repository';
import { deletionAccount } from './record-deletion';
import { useEffect, useState } from 'react';
import { projectRepository } from './project-repository';
import { createRoot } from 'react-dom/client';
import {
  Alert,
  AppBar,
  Drawer,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
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
import '@fontsource-variable/geist';
import { workTheme } from './theme';
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
  const theme = workTheme(mode, reducedMotion);
  const desktop = useMediaQuery('(min-width:1200px)');
  const [themeAnchor, setThemeAnchor] = useState<HTMLElement | null>(null);
  const toggleTheme = (
    <>
      <IconButton
        aria-label="Escolher tema"
        id="theme-menu-trigger"
        aria-controls={themeAnchor ? 'theme-menu' : undefined}
        aria-haspopup="menu"
        aria-expanded={Boolean(themeAnchor)}
        onClick={(event) => setThemeAnchor(event.currentTarget)}
      >
        <UiIcon kind={mode === 'dark' ? 'sun' : 'moon'} />
      </IconButton>
      <Menu
        id="theme-menu"
        slotProps={{ list: { 'aria-labelledby': 'theme-menu-trigger' } }}
        anchorEl={themeAnchor}
        open={Boolean(themeAnchor)}
        onClose={() => setThemeAnchor(null)}
      >
        {(
          [
            { value: null, label: 'Sistema' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Escuro' },
          ] as const
        ).map(({ value, label }) => (
          <MenuItem
            key={label}
            role="menuitemradio"
            aria-checked={themeOverride === value}
            selected={themeOverride === value}
            onClick={() => {
              setThemeOverride(value);
              setThemeAnchor(null);
            }}
          >
            {label}
          </MenuItem>
        ))}
      </Menu>
    </>
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
  return (
    <PrivacyContext.Provider value={{ revealed }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <a className="skip-link" href="#conteudo">
          Ir para o conteúdo
        </a>
        {authorized && services ? (
          <>
            <AppBar
              position="static"
              elevation={0}
              sx={{ ml: { lg: '280px' }, width: { lg: 'calc(100% - 280px)' } }}
            >
              <Toolbar
                sx={{
                  gap: { xs: 0.25, sm: 1 },
                  minHeight: { xs: 60, sm: 64 },
                  px: { xs: 1, sm: 2 },
                  flexWrap: 'nowrap',
                }}
              >
                <IconButton
                  sx={{ display: { lg: 'none' } }}
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
                {toggleTheme}
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
              </Toolbar>
            </AppBar>
            <Drawer
              variant={desktop ? 'permanent' : 'temporary'}
              open={desktop || menuOpen}
              onClose={() => setMenuOpen(false)}
              slotProps={{ paper: { sx: { width: 280, borderRadius: 0 } } }}
            >
              <Box
                component="nav"
                id="menu-principal"
                aria-label="Menu principal"
                sx={{
                  width: 280,
                  maxWidth: '85vw',
                  p: 2,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
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
                  Projetos, tempo e contexto
                </Typography>
                {!desktop && (
                  <IconButton
                    aria-label="Fechar menu"
                    onClick={() => setMenuOpen(false)}
                  >
                    <UiIcon kind="close" />
                  </IconButton>
                )}
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ px: 2, mt: 2 }}
                >
                  Trabalho e gestão
                </Typography>
                <List sx={{ flex: 1 }}>
                  {[
                    ['/app', 'Dashboard'],
                    ['/me', 'Meu relatório'],
                    ['/calendar', 'Calendário'],
                    ['/projects', 'Projetos'],
                    ['/records', 'Meus registros'],
                    ['/pending', 'Pendências'],
                    ['/rules', 'Regras'],
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
                                  : to === '/calendar'
                                    ? 'calendar'
                                    : to === '/records'
                                      ? 'records'
                                      : 'chart'
                        }
                      />
                      <ListItemText primary={label} sx={{ ml: 2 }} />
                    </ListItemButton>
                  ))}
                </List>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ px: 2, overflowWrap: 'anywhere', mb: 1 }}
                >
                  {user.email}
                </Typography>
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
              sx={{
                py: { xs: 2, sm: 3 },
                px: { xs: 2, sm: 3 },
                ml: { lg: '280px' },
                width: { lg: 'calc(100% - 280px)' },
                minWidth: 0,
              }}
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
              <CardContent
                sx={{
                  p: { xs: 2.5, sm: 4 },
                  '&:last-child': { pb: { xs: 2.5, sm: 4 } },
                }}
              >
                <Stack direction="row" sx={{ justifyContent: 'end' }}>
                  {toggleTheme}
                </Stack>
                <Stack spacing={3}>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: 'action.selected',
                      color: 'primary.main',
                      borderRadius: 2,
                    }}
                  >
                    <UiIcon kind="projects" />
                  </Box>
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
