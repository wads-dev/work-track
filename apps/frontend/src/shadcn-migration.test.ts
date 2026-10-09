import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('.', import.meta.url);
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory()
      ? sources(path)
      : /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')
        ? [path]
        : [];
  });
}
describe('complete shadcn migration', () => {
  it('has no MUI/Emotion dependencies or legacy style adapter', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', root), 'utf8'),
    );
    for (const name of Object.keys(pkg.dependencies))
      expect(name).not.toMatch(/@mui|@emotion/);
    for (const path of sources(root.pathname)) {
      const source = readFileSync(path, 'utf8');
      expect(source, path).not.toMatch(/from ['"]@(?:mui|emotion)\//);
      expect(source, path).not.toMatch(/\bsx=|SxProps|createTheme/);
    }
  });
  it('owns actual Radix-backed shadcn controls and Tailwind theme tokens', () => {
    for (const file of [
      'dialog',
      'sheet',
      'select',
      'tabs',
      'checkbox',
      'tooltip',
    ]) {
      expect(
        readFileSync(new URL('components/ui/' + file + '.tsx', root), 'utf8'),
      ).toContain('radix-ui');
    }
    const css = readFileSync(new URL('styles.css', root), 'utf8');
    expect(css).toMatch(/@import ['"]tailwindcss['"]/);
    expect(css).toContain('.dark');
    expect(css).toContain('prefers-reduced-motion');
  });
  it('keeps keyboard skip navigation and semantic active routes', () => {
    const shell = readFileSync(new URL('main.tsx', root), 'utf8');
    expect(shell).toContain('href="#conteudo"');
    expect(shell).toContain('aria-current={active');
    expect(shell).toContain('TooltipProvider');
    expect(shell).toContain('savePrivacyPreference');
  });
});
