import { expect, it } from 'vitest';
import { oauthBaseUrl } from './runtime-environment.js';
const demo = {
  FUNCTIONS_EMULATOR: 'true',
  GCLOUD_PROJECT: 'demo-work-track',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8081',
  WORK_TRACK_PUBLIC_ORIGIN: 'http://localhost:5173',
};
it('uses production HTTPS without emulator flags and never trusts override alone', () => {
  expect(oauthBaseUrl({})).toBe('https://wadsworktrack.web.app');
  expect(() =>
    oauthBaseUrl({ WORK_TRACK_PUBLIC_ORIGIN: 'http://localhost:5173' }),
  ).toThrow();
});
it('requires demo project and both emulators for explicit loopback origin', () => {
  expect(oauthBaseUrl(demo)).toBe('http://localhost:5173');
  expect(
    oauthBaseUrl({
      ...demo,
      WORK_TRACK_PUBLIC_ORIGIN: 'http://127.0.0.1:5199',
    }),
  ).toBe('http://127.0.0.1:5199');
  for (const override of [
    { GCLOUD_PROJECT: 'wadsworktrack' },
    { FIREBASE_AUTH_EMULATOR_HOST: undefined },
    { FIRESTORE_EMULATOR_HOST: undefined },
    { WORK_TRACK_PUBLIC_ORIGIN: undefined },
    { WORK_TRACK_PUBLIC_ORIGIN: 'http://evil.example' },
    { WORK_TRACK_PUBLIC_ORIGIN: 'http://localhost:5173/path' },
    { WORK_TRACK_PUBLIC_ORIGIN: 'http://user@localhost:5173' },
  ])
    expect(() => oauthBaseUrl({ ...demo, ...override })).toThrow();
});
