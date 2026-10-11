/* global window, document */
// Run against an isolated, ready demo Docker environment; never production.
// PLAYWRIGHT_MODULE=<installed playwright module> FRONTEND_URL=http://localhost:PORT node apps/frontend/src/infrastructure/firebase/auth-session.browser-check.mjs
import assert from 'node:assert/strict';

export async function checkAuthSession(browser, frontendUrl) {
  const origin = new URL(frontendUrl);
  assert.ok(['localhost', '127.0.0.1'].includes(origin.hostname));
  const context = await browser.newContext();
  try {
    const observer = await context.newPage();
    await observer.goto(frontendUrl);
    const config = await observer.evaluate(async () =>
      (await fetch('/__/firebase/init.json')).json(),
    );
    assert.equal(config.projectId, 'demo-work-track');

    await observer.route('**/__auth-session-check', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<div>Auth session check</div>',
      }),
    );
    await observer.goto(frontendUrl + '/__auth-session-check');
    // Reuse the exact Vite SDK URL (including its version) to avoid loading a
    // second Auth SDK instance into the observer harness.
    const bootstrap = await observer.request.get(
      frontendUrl + '/src/infrastructure/firebase/firebase.ts',
    );
    const authModule = (await bootstrap.text()).match(
      /from ["']([^"']*firebase_auth\.js[^"']*)["']/,
    )?.[1];
    assert.ok(authModule, 'Expected the Vite Firebase Auth module');
    await observer.addScriptTag({
      type: 'module',
      content: authEntry.replace(
        '/node_modules/.vite/deps/firebase_auth.js',
        authModule,
      ),
    });
    await observer.waitForFunction(() => window.authCheck?.ready);
    const authFailures = [];
    observer.on('requestfailed', (request) =>
      authFailures.push({
        url: new URL(request.url()).pathname,
        error: request.failure()?.errorText,
      }),
    );
    try {
      await observer.evaluate(() => window.authCheck.login());
    } catch (error) {
      throw new Error('Demo login failed: ' + JSON.stringify(authFailures), {
        cause: error,
      });
    }
    const uid = await observer.evaluate(() => window.authCheck.uid());
    assert.ok(uid);
    await observer.evaluate(() => window.authCheck.reset());
    // Widen the restoration window so the old persistence migration cannot hide
    // behind coalesced storage events on a fast emulator.
    await context.route('**/accounts:lookup?*', async (route) => {
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({ response });
    });
    const errors = [];
    const pages = await Promise.all(
      Array.from({ length: 4 }, () => context.newPage()),
    );
    const routes = [
      '/projects/design-demo-reservado?returnTo=%2Fprojects&tab=overview',
      '/calendar',
      '/projects/design-demo-reservado?returnTo=%2Fprojects&tab=details',
      '/calendar?view=week&date=2026-10-05',
    ];
    await Promise.all(
      pages.map(async (page, i) => {
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        await page.goto(frontendUrl + routes[i]);
        await page.getByRole('button', { name: 'Sair', exact: true }).waitFor();
        await page.waitForFunction(
          () => !document.body.innerText.includes('Carregando'),
        );
        assert.equal(new URL(page.url()).pathname, routes[i].split('?')[0]);
        await page.reload();
        await page.getByRole('button', { name: 'Sair', exact: true }).waitFor();
      }),
    );
    assert.deepEqual(errors, []);
    const observed = await observer.evaluate(() => window.authCheck.snapshot());
    assert.equal(observed.uid, uid);
    assert.equal(
      observed.logouts,
      0,
      'Opening another tab must not emit signed-out',
    );
    assert.equal(
      observed.removals,
      0,
      'Restoration must never remove the shared auth key',
    );

    // A failed page bootstrap must not delete the valid login in another tab.
    const failed = await context.newPage();
    await failed.route('**/__/firebase/init.json', (route) =>
      route.fulfill({ status: 503, body: 'Unavailable' }),
    );
    await failed.goto(frontendUrl + '/calendar');
    await failed
      .getByText('Configuração Firebase indisponível. Recarregue a página.')
      .waitFor();
    assert.equal(await observer.evaluate(() => window.authCheck.uid()), uid);
    await pages[0].getByRole('button', { name: 'Sair', exact: true }).click();
    await observer.waitForFunction(() => !window.authCheck.uid());
    await Promise.all(
      pages
        .slice(1)
        .map((page) =>
          page.getByRole('button', { name: 'Entrar com Google' }).waitFor(),
        ),
    );
    return {
      restoredTabs: pages.length,
      reloads: pages.length,
      logoutsDuringRestoration: observed.logouts,
      authKeyRemovals: observed.removals,
      bootstrapFailurePreservedSession: true,
      explicitLogoutSynchronized: true,
    };
  } finally {
    await context.close();
  }
}

const authEntry = `import { initializeServices } from '/src/infrastructure/firebase/firebase.ts';
import { GoogleAuthProvider, signInWithCredential, onAuthStateChanged } from '/node_modules/.vite/deps/firebase_auth.js';
(async () => {
  const { auth } = await initializeServices();
  let logouts = 0, removals = 0;
  onAuthStateChanged(auth, user => { if (!user) logouts++; });
  window.addEventListener('storage', event => { if (event.key?.startsWith('firebase:authUser:') && event.newValue === null) removals++; });
  window.authCheck = {
    ready: true,
    uid: () => auth.currentUser?.uid ?? '',
    snapshot: () => ({ uid: auth.currentUser?.uid ?? '', logouts, removals }),
    reset: () => { logouts = 0; removals = 0; },
    login: () => {
      const encode = value => btoa(JSON.stringify(value)).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');
      const token = encode({ alg: 'none', typ: 'JWT' }) + '.' + encode({ sub: 'auth-session-check', email: 'auth.session.check@wads.dev', email_verified: true, name: 'Auth session check (DEMO)', aud: 'demo-work-track', iss: 'https://accounts.google.com', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }) + '.';
      return signInWithCredential(auth, GoogleAuthProvider.credential(token));
    },
  };
})();`;

if (process.env.PLAYWRIGHT_MODULE && process.env.FRONTEND_URL) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL,
  });
  try {
    console.log(await checkAuthSession(browser, process.env.FRONTEND_URL));
  } finally {
    await browser.close();
  }
}
