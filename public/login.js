import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {
  getAuth,
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
  document.getElementById('client').textContent =
    'Cliente solicitante: ' + data.clientName;
  document.getElementById('redirect').textContent =
    'Retorno autorizado: ' + data.redirectUri;
  const configResponse = await fetch('/__/firebase/init.json');
  if (!configResponse.ok)
    throw new Error('Configuração Firebase indisponível.');
  const auth = getAuth(initializeApp(await configResponse.json()));
  await setPersistence(auth, inMemoryPersistence);
  button.disabled = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
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
      status.textContent =
        error instanceof Error ? error.message : 'Falha no login.';
      button.disabled = false;
    }
  });
}
setup().catch((error) => {
  status.textContent = error.message;
});
