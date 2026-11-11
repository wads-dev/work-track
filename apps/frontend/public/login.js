import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  signInWithPopup,
  inMemoryPersistence,
  setPersistence,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';

const button = document.getElementById('login');
const status = document.getElementById('status');
const flow = new URLSearchParams(location.search).get('flow');
async function setup() {
  if (!flow) throw new Error('Abra esta página a partir do seu cliente MCP.');
  const response = await fetch('/flow?flow=' + encodeURIComponent(flow));
  if (!response.ok)
    throw new Error('Solicitação inválida ou expirada. Reconecte o MCP.');
  const data = await response.json();
  document.getElementById('client').textContent = data.clientName;
  document.getElementById('redirect').textContent = data.redirectUri;
  const configResponse = await fetch('/__/firebase/init.json');
  if (!configResponse.ok)
    throw new Error('Configuração Firebase indisponível.');
  const config = await configResponse.json();
  const auth = getAuth(initializeApp(config));
  if (config.projectId === 'demo-work-track') {
    if (!['localhost', '127.0.0.1'].includes(location.hostname))
      throw new Error('Demo login requires loopback.');
    const port = config.emulatorPorts?.auth ?? 9099;
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('Invalid Auth emulator port.');
    connectAuthEmulator(auth, 'http://' + location.hostname + ':' + port);
    document.querySelector('.intro').textContent =
      'Ambiente DEMO local — autorize usando uma conta sintética do Auth Emulator. Não use credenciais de produção.';
  }
  await setPersistence(auth, inMemoryPersistence);
  status.dataset.state = 'ready';
  status.textContent = '';
  button.disabled = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.dataset.state = 'loading';
    status.textContent = 'Aguardando login Google…';
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        hd: 'wads.dev',
        prompt: 'select_account',
      });
      const result = await signInWithPopup(auth, provider);
      const complete = await fetch('/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flow,
          idToken: await result.user.getIdToken(),
          consent: true,
        }),
      });
      const body = await complete.json();
      await signOut(auth);
      if (!complete.ok)
        throw new Error(body.message ?? 'Não foi possível autorizar.');
      location.replace(body.redirect);
    } catch (error) {
      status.dataset.state = 'error';
      status.textContent =
        error instanceof Error ? error.message : 'Falha no login.';
      button.disabled = false;
    }
  });
}
setup().catch((error) => {
  status.dataset.state = 'error';
  const client = document.getElementById('client');
  const redirect = document.getElementById('redirect');
  if (client.textContent === 'Carregando solicitação…') {
    client.textContent = 'Solicitação indisponível';
    redirect.textContent = 'Não validado';
  }
  status.textContent = error.message;
});
