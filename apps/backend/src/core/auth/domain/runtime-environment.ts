/** Never infer emulator trust from request headers or hostnames. */
export function oauthBaseUrl(env: Record<string, string | undefined>): string {
  const production = 'https://wadsworktrack.web.app';
  const configured = env.WORK_TRACK_PUBLIC_ORIGIN;
  if (env.FUNCTIONS_EMULATOR !== 'true') {
    if (configured && configured !== production)
      throw new Error('OAuth origin override requires demo emulators.');
    return production;
  }
  if (
    (env.GCLOUD_PROJECT ?? env.GOOGLE_CLOUD_PROJECT) !== 'demo-work-track' ||
    !env.FIREBASE_AUTH_EMULATOR_HOST ||
    !env.FIRESTORE_EMULATOR_HOST
  )
    throw new Error(
      'Local OAuth requires demo-work-track with Auth and Firestore emulators.',
    );
  if (!configured)
    throw new Error('WORK_TRACK_PUBLIC_ORIGIN is required for local OAuth.');
  const url = new URL(configured);
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Local OAuth origin must be an explicit loopback HTTP origin.',
    );
  return url.origin;
}
