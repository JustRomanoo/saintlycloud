function getDefaultApiBase(): string {
  if (typeof window === 'undefined') return '/api';
  if (window.location.hostname === 'localhost') return '/api';
  return 'https://saintlycloud-production.up.railway.app/api';
}

function normalizeApiBase(input: string): string {
  const trimmed = (input || '').trim();
  if (!trimmed) return '/api';
  if (trimmed.startsWith('/')) return trimmed.replace(/\/+$/, '') || '/api';
  try {
    const u = new URL(trimmed);
    const base = trimmed.replace(/\/+$/, '');
    if (u.pathname === '/' || u.pathname === '') return `${base}/api`;
    return base;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

const API = normalizeApiBase(import.meta.env.VITE_API_URL || getDefaultApiBase());

function getFallbackApiBase(primary: string): string | null {
  if (typeof window === 'undefined') return null;
  if (window.location.hostname === 'localhost') return null;
  if (primary.startsWith('http')) return '/api';
  return 'https://saintlycloud-production.up.railway.app/api';
}

async function jsonFetch(url: string, options?: RequestInit): Promise<any> {
  const headers = {
    'Content-Type': 'application/json',
    ...(options?.headers || {}),
  };

  async function attempt(base: string): Promise<any> {
    const normalizedBase = normalizeApiBase(base);
    let res: Response;
    try {
      res = await fetch(`${normalizedBase}${url}`, {
        ...options,
        headers,
      });
    } catch {
      throw new Error('FETCH_FAILED');
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('NOT_JSON');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed. Please try again.');
    return data;
  }

  const primary = API;
  const fallback = getFallbackApiBase(primary);

  try {
    return await attempt(primary);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if ((msg === 'FETCH_FAILED' || msg === 'NOT_JSON') && fallback && fallback !== primary) {
      try {
        return await attempt(fallback);
      } catch (fallbackErr: unknown) {
        const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : '';
        if (fallbackMsg === 'FETCH_FAILED') throw new Error('Cannot connect right now. Please try again.');
        if (fallbackMsg === 'NOT_JSON') throw new Error('Service temporarily unavailable. Please try again.');
        throw fallbackErr;
      }
    }
    if (msg === 'FETCH_FAILED') throw new Error('Cannot connect right now. Please try again.');
    if (msg === 'NOT_JSON') throw new Error('Service temporarily unavailable. Please try again.');
    throw err;
  }
}

export interface CloudSession {
  cloudId: string;
  secret: string;
  createdAt?: string;
}

export interface Device {
  deviceId: string;
  name: string;
  lastActive: string;
}

export interface CloudData {
  bookmarks: any[];
  history: any[];
  profile: any;
  updatedAt?: string;
}

export async function createAccount(deviceId: string, secret: string, deviceName?: string): Promise<{ cloudId: string; recoveryCode: string }> {
  return jsonFetch('/create-account', {
    method: 'POST',
    body: JSON.stringify({ deviceId, secret, deviceName }),
  });
}

export async function validateCredentials(cloudId: string, secret: string): Promise<{ cloudId: string; createdAt: string }> {
  return jsonFetch('/validate', {
    method: 'POST',
    body: JSON.stringify({ cloudId, secret }),
  });
}

export async function getDevices(session: CloudSession): Promise<{ devices: Device[] }> {
  return jsonFetch(`/devices?cloudId=${session.cloudId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', 'x-secret': session.secret },
  });
}

export async function removeDevice(session: CloudSession, deviceId: string): Promise<void> {
  await jsonFetch('/devices/remove', {
    method: 'POST',
    body: JSON.stringify({ cloudId: session.cloudId, secret: session.secret, deviceId }),
  });
}

export async function renameDevice(session: CloudSession, deviceId: string, name: string): Promise<void> {
  await jsonFetch('/devices/rename', {
    method: 'POST',
    body: JSON.stringify({ cloudId: session.cloudId, secret: session.secret, deviceId, name }),
  });
}

export async function pushData(session: CloudSession, data: { bookmarks?: any; history?: any; profile?: any }): Promise<void> {
  await jsonFetch('/sync/push', {
    method: 'POST',
    body: JSON.stringify({ cloudId: session.cloudId, secret: session.secret, data }),
  });
}

export async function pullData(session: CloudSession): Promise<CloudData> {
  return jsonFetch(`/sync/pull?cloudId=${session.cloudId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', 'x-secret': session.secret },
  });
}

export async function recoverAccount(recoveryCode: string, newSecret: string): Promise<{ cloudId: string }> {
  return jsonFetch('/recover', {
    method: 'POST',
    body: JSON.stringify({ recoveryCode, newSecret }),
  });
}

export async function regenerateSecret(session: CloudSession, newSecret: string): Promise<void> {
  await jsonFetch('/regenerate', {
    method: 'POST',
    body: JSON.stringify({ cloudId: session.cloudId, oldSecret: session.secret, newSecret }),
  });
}

export async function getRecoveryCode(session: CloudSession): Promise<{ code: string }> {
  return jsonFetch(`/recovery-code/${session.cloudId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', 'x-secret': session.secret },
  });
}

export async function getAccountInfo(session: CloudSession): Promise<{ cloudId: string; createdAt: string }> {
  return jsonFetch(`/account/${session.cloudId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', 'x-secret': session.secret },
  });
}

export async function storeOAuthToken(session: CloudSession, accessToken: string, username: string): Promise<void> {
  await jsonFetch('/oauth/store', {
    method: 'POST',
    body: JSON.stringify({ cloudId: session.cloudId, secret: session.secret, accessToken, username }),
  });
}

export async function getOAuthToken(session: CloudSession): Promise<{ accessToken: string; username: string } | null> {
  return jsonFetch(`/oauth/token?cloudId=${session.cloudId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', 'x-secret': session.secret },
  });
}

export async function completeOAuth(initToken: string, accessToken: string, username: string): Promise<void> {
  await jsonFetch('/oauth/complete', {
    method: 'POST',
    body: JSON.stringify({ initToken, accessToken, username }),
  });
}
