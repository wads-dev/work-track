export const developmentEnvironmentKey = 'work-track:dev-firebase-environment';
export function developmentProductionMode(
  development: boolean,
  hostname: string,
  storage?: Pick<Storage, 'getItem'>,
): boolean {
  if (!development || !['localhost', '127.0.0.1'].includes(hostname))
    return false;
  try {
    return storage?.getItem(developmentEnvironmentKey) === 'production';
  } catch {
    return false;
  }
}
