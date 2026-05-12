const API = import.meta.env.VITE_API_URL || '/api';

async function jsonFetch(url: string, options?: RequestInit): Promise<any> {
  const res = await fetch(`${API}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
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
