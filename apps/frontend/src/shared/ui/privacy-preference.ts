const key = (uid: string) => 'work-track:privacy-revealed:' + uid;

export function readPrivacyPreference(uid: string): boolean {
  if (!uid) return false;
  try {
    return localStorage.getItem(key(uid)) === 'true';
  } catch {
    return false;
  }
}

export function savePrivacyPreference(uid: string, revealed: boolean): void {
  if (!uid) return;
  try {
    localStorage.setItem(key(uid), String(revealed));
  } catch {
    // Storage may be blocked; the current session still honors the choice.
  }
}
