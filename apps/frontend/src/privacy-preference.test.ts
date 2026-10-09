import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readPrivacyPreference,
  savePrivacyPreference,
} from './privacy-preference';

afterEach(() => vi.unstubAllGlobals());

describe('privacy preference', () => {
  const storage = () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    return values;
  };
  it('defaults to hidden and restores the last explicit choice in either direction', () => {
    storage();
    expect(readPrivacyPreference('alice')).toBe(false);
    savePrivacyPreference('alice', true);
    expect(readPrivacyPreference('alice')).toBe(true);
    savePrivacyPreference('alice', false);
    expect(readPrivacyPreference('alice')).toBe(false);
  });
  it('does not share choices between accounts or anonymous sessions', () => {
    const values = storage();
    savePrivacyPreference('alice', true);
    expect(readPrivacyPreference('bob')).toBe(false);
    expect(readPrivacyPreference('')).toBe(false);
    savePrivacyPreference('', true);
    expect(values.size).toBe(1);
    expect(readPrivacyPreference('alice')).toBe(true);
  });
  it('fails safely when storage is unavailable or contains an invalid value', () => {
    const values = storage();
    values.set('work-track:privacy-revealed:alice', 'invalid');
    expect(readPrivacyPreference('alice')).toBe(false);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readPrivacyPreference('alice')).toBe(false);
    expect(() => savePrivacyPreference('alice', true)).not.toThrow();
  });
});
