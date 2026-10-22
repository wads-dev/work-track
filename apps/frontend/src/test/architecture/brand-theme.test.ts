import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');
const css = source('../../styles.css');
const tokens = (block: string) =>
  Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/g)].map(
      ([, key, value]) => [key, value],
    ),
  );
const themes = [
  tokens(css.split(':root {')[1].split('}')[0]),
  tokens(css.split('.dark {')[1].split('}')[0]),
];
function luminance(hex: string) {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((part) => {
      const value = parseInt(part, 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
describe('WorkTrack brand themes', () => {
  it('uses approved petroleum as the light primary and theme-aware focus colors', () => {
    expect(themes[0].primary).toBe('#0d5963');
    expect(css).toContain('outline: 3px solid var(--ring)');
    expect(css).toContain('background: var(--primary)');
    expect(css).toContain('color-scheme: light');
    expect(css).toContain('color-scheme: dark');
  });
  for (const [index, theme] of themes.entries()) {
    it('keeps readable text and controls in theme ' + index, () => {
      for (const [foreground, background] of [
        ['foreground', 'background'],
        ['card-foreground', 'card'],
        ['popover-foreground', 'popover'],
        ['primary-foreground', 'primary'],
        ['secondary-foreground', 'secondary'],
        ['accent-foreground', 'accent'],
        ['sidebar-foreground', 'sidebar'],
        ['muted-foreground', 'muted'],
        ['muted-foreground', 'card'],
        ['destructive', 'card'],
      ])
        expect(
          contrast(theme[foreground], theme[background]),
          foreground + '/' + background,
        ).toBeGreaterThanOrEqual(4.5);
      for (const background of ['background', 'card']) {
        expect(contrast(theme.ring, theme[background])).toBeGreaterThanOrEqual(
          3,
        );
        expect(contrast(theme.input, theme[background])).toBeGreaterThanOrEqual(
          3,
        );
      }
    });
  }
  it('keeps standalone login and offline colors aligned in both themes', () => {
    const login = source('../../../public/login.css');
    const offline = source('../../../public/offline.html');
    for (const theme of themes) {
      for (const key of [
        'background',
        'foreground',
        'primary',
        'muted-foreground',
      ]) {
        expect(login).toContain(theme[key]);
        expect(offline).toContain(theme[key]);
      }
    }
    expect(offline).toContain('prefers-color-scheme: dark');
    expect(login).toContain('prefers-color-scheme: dark');
    for (const file of ['../../../index.html', '../../../vite.config.ts']) {
      expect(source(file)).toContain('#0d5963');
      expect(source(file)).not.toContain('#0f172a');
    }
  });
});
