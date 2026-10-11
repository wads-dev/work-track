/* global document, window */
// Run from the repository root against its isolated Docker frontend:
// PLAYWRIGHT_MODULE=<installed playwright module> FRONTEND_URL=http://localhost:PORT node apps/frontend/src/features/projects/ProjectSelector.browser-check.mjs
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

if (!process.env.PLAYWRIGHT_MODULE || !process.env.FRONTEND_URL) {
  throw new Error('Set PLAYWRIGHT_MODULE and the isolated Docker FRONTEND_URL');
}
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const result = await build({
  absWorkingDir: root,
  stdin: {
    contents: `import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectSelector } from './apps/frontend/src/features/projects/ProjectSelector';
const projects = [
  { id: 'one', label: 'Ação principal' },
  { id: 'beta', label: 'Projeto Beta', searchText: 'Projeto Beta Entrega API' },
  { id: 'all', label: 'Projeto chamado all' },
];
function App() {
  const [props, setProps] = useState({ projects, projectId: 'one' });
  window.updateSelector = update => setProps(current => ({ ...current, ...update }));
  return <div style={{ padding: 40, width: 320 }}>
    <button>Antes</button>
    <ProjectSelector {...props} onChange={projectId => setProps(current => ({ ...current, projectId }))} />
    <button>Depois</button>
    <output id="selection">{props.projectId}</output>
  </div>;
}
createRoot(document.getElementById('root')).render(<App />);`,
    loader: 'tsx',
    resolveDir: root,
  },
  tsconfig: 'apps/frontend/tsconfig.json',
  bundle: true,
  write: false,
  format: 'iife',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL,
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/__project-selector-check', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><head><script type="module" src="/src/styles.css"></script></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto(process.env.FRONTEND_URL + '/__project-selector-check');
  await page.addScriptTag({ content: result.outputFiles[0].text });
  const trigger = page.getByRole('combobox', { name: 'Projeto', exact: true });
  const search = page.getByRole('textbox', {
    name: 'Pesquisar projeto',
    exact: true,
  });
  const open = async () => {
    await trigger.click();
    await search.waitFor();
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute('placeholder') ===
        'Pesquisar projeto',
    );
  };
  assert.equal(await trigger.locator('svg').count(), 1);
  assert.equal(await page.getByRole('textbox').count(), 0);
  assert.match(await trigger.textContent(), /Ação principal/);
  await open();
  assert.equal(await page.getByRole('option').count(), 4);
  assert.equal(await search.inputValue(), '');
  await search.pressSequentially('entrega API', { delay: 30 });
  assert.equal(await search.inputValue(), 'entrega API');
  assert.equal(
    await search.evaluate((element) => element === document.activeElement),
    true,
  );
  assert.deepEqual(await page.getByRole('option').allTextContents(), [
    'Projeto Beta',
  ]);
  await search.press('Home');
  assert.equal(await search.evaluate((element) => element.selectionStart), 0);
  await search.press('End');
  assert.equal(await search.evaluate((element) => element.selectionStart), 11);
  await search.press('ArrowDown');
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('role') === 'option',
  );
  assert.match(
    await page.evaluate(() => document.activeElement.textContent),
    /Projeto Beta/,
  );
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('placeholder') ===
      'Pesquisar projeto',
  );
  await search.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.getByRole('listbox').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#selection').textContent(), 'beta');
  assert.equal(
    await trigger.evaluate((element) => element === document.activeElement),
    true,
  );
  await open();
  await search.pressSequentially('zzzz');
  assert.equal(await page.getByRole('option').count(), 0);
  assert.match(
    await page.getByRole('status').textContent(),
    /Nenhum projeto encontrado/,
  );
  assert.equal(
    await search.evaluate((element) => element === document.activeElement),
    true,
  );
  await search.press('Escape');
  await page.getByRole('listbox').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#selection').textContent(), 'beta');
  assert.equal(
    await trigger.evaluate((element) => element === document.activeElement),
    true,
  );
  await open();
  assert.equal(await search.inputValue(), '');
  await page.getByRole('option', { name: 'Todos os projetos' }).click();
  assert.equal(await page.locator('#selection').textContent(), '');
  await open();
  await page.getByRole('option', { name: 'Projeto chamado all' }).click();
  assert.equal(await page.locator('#selection').textContent(), 'all');
  await open();
  await search.press('Tab');
  await page.getByRole('listbox').waitFor({ state: 'hidden' });
  await page.waitForFunction(
    () => document.activeElement?.textContent === 'Depois',
  );
  await open();
  await search.press('Shift+Tab');
  await page.getByRole('listbox').waitFor({ state: 'hidden' });
  await page.waitForFunction(
    () => document.activeElement?.textContent === 'Antes',
  );
  await open();
  await search.fill('entrega');
  await page.evaluate(() =>
    window.updateSelector({
      projects: [
        {
          id: 'beta',
          label: 'Projeto Beta atualizado',
          searchText: 'Entrega API',
        },
        { id: 'new', label: 'Nova entrega' },
      ],
    }),
  );
  assert.equal(
    await search.evaluate((element) => element === document.activeElement),
    true,
  );
  assert.equal(await search.inputValue(), 'entrega');
  await search.press('Escape');
  await page.evaluate(() => window.updateSelector({ projectId: 'missing' }));
  assert.match(await trigger.textContent(), /Projeto não disponível/);
  await page.evaluate(() => window.updateSelector({ disabled: true }));
  assert.equal(await trigger.isDisabled(), true);
  await page.evaluate(() =>
    window.updateSelector({
      disabled: false,
      allowAll: false,
      projectId: '',
      projects: [],
      loading: true,
      error: 'Erro de catálogo',
    }),
  );
  assert.match(await trigger.textContent(), /Escolha o projeto/);
  assert.equal(await trigger.getAttribute('aria-invalid'), 'true');
  await open();
  assert.equal(await page.getByRole('option').count(), 0);
  assert.match(
    await page.getByRole('status').textContent(),
    /Carregando projetos/,
  );
  await page.evaluate(() => window.updateSelector({ loading: false }));
  await page.getByText('Nenhum projeto encontrado', { exact: true }).waitFor();
  assert.match(
    await page.getByRole('status').textContent(),
    /Nenhum projeto encontrado/,
  );
  assert.equal(
    await search.evaluate((element) => element === document.activeElement),
    true,
  );
  await search.press('ArrowDown');
  assert.equal(
    await search.evaluate((element) => element === document.activeElement),
    true,
  );
  await search.press('Escape');
  await page.evaluate(() =>
    window.updateSelector({
      projectId: 'long',
      projects: [
        { id: 'long', label: 'Nome muito longo '.repeat(30) },
        { id: 'short', label: 'Outro projeto' },
      ],
    }),
  );
  await trigger.focus();
  await trigger.press('ArrowDown');
  await search.waitFor();
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('placeholder') ===
      'Pesquisar projeto',
  );
  await page.getByRole('listbox').evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
  });
  const visibleTrigger = page.locator('[data-slot="select-trigger"]');
  const triggerBox = await visibleTrigger.boundingBox();
  const menuBox = await page.getByRole('listbox').boundingBox();
  assert.ok(
    menuBox.y >= triggerBox.y + triggerBox.height,
    'Popper must open below the trigger with room available',
  );
  assert.ok(
    Math.abs(menuBox.width - triggerBox.width) <= 2,
    'Menu must match trigger width',
  );
  assert.ok(
    await visibleTrigger.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
    'Long selected name must not overflow trigger',
  );
  await search.press('ArrowDown');
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('role') === 'option',
  );
  await page.keyboard.press('End');
  await page.waitForFunction(() =>
    document.activeElement?.textContent?.includes('Outro projeto'),
  );
  await page.keyboard.press('Home');
  await page.waitForFunction(() =>
    document.activeElement?.textContent?.startsWith('Nome muito longo'),
  );
  await page.mouse.click(5, 5);
  await page.getByRole('listbox').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#selection').textContent(), 'long');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: real Chromium selector trigger, search/typeahead, spaces, focus, keyboard, Escape, Tab/Shift+Tab, all/required, async updates, disabled/loading/error/unavailable',
  );
} finally {
  await browser.close();
}
