import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const publicFile = (name: string) =>
  readFileSync(new URL('../public/' + name, import.meta.url));
describe('PWA identity and safe offline behavior', () => {
  it('ships correctly sized PNGs for desktop, Apple and Android', () => {
    for (const [name, size] of [
      ['pwa-192.png', 192],
      ['pwa-512.png', 512],
      ['pwa-maskable-512.png', 512],
      ['apple-touch-icon.png', 180],
    ] as const) {
      const png = publicFile(name);
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
    }
  });
  it('includes favicon and the public offline notice', () => {
    expect(publicFile('favicon.ico').readUInt16LE(2)).toBe(1);
    expect(publicFile('offline.html').toString()).toContain(
      'Você está sem conexão',
    );
  });
  it('configures standalone installation without caching private data', () => {
    const source = readFileSync(
      new URL('../vite.config.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain("display: 'standalone'");
    expect(source).toContain('navigateFallback: null');
    expect(source).toContain("handler: 'NetworkOnly'");
    expect(source).toContain(
      "globPatterns: ['offline.html', 'brand.svg', '*.png', '*.ico']",
    );
  });
});
