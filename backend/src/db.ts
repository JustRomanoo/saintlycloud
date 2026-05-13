import Database from 'better-sqlite3';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const DB_PATH = process.env.DATABASE_PATH || process.env.DB_PATH || './saintlycloud.db';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function normalizeCloudId(cloudId: string): string {
  return (cloudId || '').trim().toUpperCase();
}

function normalizeSecret(secret: string): string {
  return (secret || '').trim();
}

function hashSecret(secret: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(secret, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifySecret(secret: string, stored: string): boolean {
  try {
    const parts = stored.split(':');
    if (parts.length !== 2) return false;
    const [salt, key] = parts;
    const hash = scryptSync(secret, salt, 64).toString('hex');
    return hash.length === key.length && timingSafeEqual(Buffer.from(hash), Buffer.from(key));
  } catch {
    return false;
  }
}

function generateCloudId(): string {
  const raw = randomBytes(4).toString('hex').toUpperCase();
  return `SA-CLD-${raw}`;
}

function generateRecoveryCode(): string {
  const seg1 = randomBytes(3).toString('hex');
  const seg2 = randomBytes(3).toString('hex');
  const seg3 = randomBytes(3).toString('hex');
  return `${seg1}-${seg2}-${seg3}`;
}

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      cloudId TEXT PRIMARY KEY,
      secret TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS devices (
      deviceId TEXT PRIMARY KEY,
      cloudId TEXT NOT NULL REFERENCES users(cloudId) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'Unknown Device',
      lastActive TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_data (
      cloudId TEXT PRIMARY KEY REFERENCES users(cloudId) ON DELETE CASCADE,
      bookmarks TEXT NOT NULL DEFAULT '[]',
      history TEXT NOT NULL DEFAULT '[]',
      profile TEXT NOT NULL DEFAULT '{}',
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recovery_codes (
      cloudId TEXT PRIMARY KEY REFERENCES users(cloudId) ON DELETE CASCADE,
      code TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_devices_cloudId ON devices(cloudId);
    CREATE INDEX IF NOT EXISTS idx_devices_deviceId ON devices(deviceId);
    CREATE INDEX IF NOT EXISTS idx_users_cloudId ON users(cloudId);
    CREATE INDEX IF NOT EXISTS idx_recovery_code ON recovery_codes(code);

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      cloudId TEXT PRIMARY KEY REFERENCES users(cloudId) ON DELETE CASCADE,
      accessToken TEXT NOT NULL,
      username TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function cloudIdPattern(): RegExp {
  return /^SA-CLD-[A-F0-9]{8}$/;
}

export function createUser(secret: string): { cloudId: string; recoveryCode: string } {
  const cloudId = generateCloudId();
  const recoveryCode = generateRecoveryCode();
  const hashed = hashSecret(normalizeSecret(secret));

  const insertUser = db.prepare('INSERT INTO users (cloudId, secret) VALUES (?, ?)');
  const insertData = db.prepare('INSERT INTO user_data (cloudId) VALUES (?)');
  const insertRecovery = db.prepare('INSERT INTO recovery_codes (cloudId, code) VALUES (?, ?)');

  const tx = db.transaction(() => {
    insertUser.run(cloudId, hashed);
    insertData.run(cloudId);
    insertRecovery.run(cloudId, recoveryCode);
  });
  tx();

  return { cloudId, recoveryCode };
}

export function validateCredentials(cloudId: string, secret: string): boolean {
  const normalizedCloudId = normalizeCloudId(cloudId);
  const normalizedSecret = normalizeSecret(secret);
  const row = db.prepare('SELECT secret FROM users WHERE cloudId = ?').get(normalizedCloudId) as { secret: string } | undefined;
  if (!row) return false;
  return verifySecret(normalizedSecret, row.secret);
}

export function getUserAuthRow(cloudId: string): { secret: string } | undefined {
  const normalizedCloudId = normalizeCloudId(cloudId);
  return db.prepare('SELECT secret FROM users WHERE cloudId = ?').get(normalizedCloudId) as { secret: string } | undefined;
}

export function updateDeviceActivity(cloudId: string, deviceId?: string) {
  const normalizedCloudId = normalizeCloudId(cloudId);
  if (deviceId) {
    db.prepare("UPDATE devices SET lastActive = datetime('now') WHERE deviceId = ? AND cloudId = ?").run(deviceId, normalizedCloudId);
  } else {
    db.prepare("UPDATE devices SET lastActive = datetime('now') WHERE cloudId = ?").run(normalizedCloudId);
  }
}

export function linkDevice(cloudId: string, deviceId: string, deviceName?: string): boolean {
  const normalizedCloudId = normalizeCloudId(cloudId);
  const exists = db.prepare('SELECT 1 FROM users WHERE cloudId = ?').get(normalizedCloudId);
  if (!exists) return false;

  db.prepare(`
    INSERT INTO devices (deviceId, cloudId, name, lastActive)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(deviceId) DO UPDATE SET lastActive = datetime('now'), name = COALESCE(?, name)
  `).run(deviceId, normalizedCloudId, deviceName || 'Unknown Device', deviceName || null);
  return true;
}

export function getDevices(cloudId: string) {
  const normalizedCloudId = normalizeCloudId(cloudId);
  return db.prepare('SELECT deviceId, name, lastActive FROM devices WHERE cloudId = ? ORDER BY lastActive DESC').all(normalizedCloudId);
}

export function removeDevice(cloudId: string, deviceId: string): boolean {
  const normalizedCloudId = normalizeCloudId(cloudId);
  const result = db.prepare('DELETE FROM devices WHERE cloudId = ? AND deviceId = ?').run(normalizedCloudId, deviceId);
  return result.changes > 0;
}

export function renameDevice(cloudId: string, deviceId: string, name: string): boolean {
  const normalizedCloudId = normalizeCloudId(cloudId);
  const result = db.prepare('UPDATE devices SET name = ? WHERE cloudId = ? AND deviceId = ?').run(name, normalizedCloudId, deviceId);
  return result.changes > 0;
}

export function pushData(cloudId: string, data: { bookmarks?: any; history?: any; profile?: any; updatedAt?: string }): boolean {
  const normalizedCloudId = normalizeCloudId(cloudId);
  const existing = db.prepare('SELECT bookmarks, history, profile, updatedAt FROM user_data WHERE cloudId = ?').get(normalizedCloudId) as any;
  if (!existing) return false;

  if (data.updatedAt && existing.updatedAt) {
    const incoming = new Date(data.updatedAt).getTime();
    const stored = new Date(existing.updatedAt).getTime();
    if (incoming < stored) {
      return true;
    }
  }

  const bookmarks = data.bookmarks !== undefined ? JSON.stringify(data.bookmarks) : existing.bookmarks;
  const history = data.history !== undefined ? JSON.stringify(data.history) : existing.history;
  const profile = data.profile !== undefined ? JSON.stringify(data.profile) : existing.profile;

  db.prepare(`
    UPDATE user_data SET bookmarks = ?, history = ?, profile = ?, updatedAt = datetime('now') WHERE cloudId = ?
  `).run(bookmarks, history, profile, normalizedCloudId);

  updateDeviceActivity(normalizedCloudId);
  return true;
}

export function pullData(cloudId: string) {
  const normalizedCloudId = normalizeCloudId(cloudId);
  const row = db.prepare('SELECT bookmarks, history, profile, updatedAt FROM user_data WHERE cloudId = ?').get(normalizedCloudId) as any;
  if (!row) return null;

  return {
    bookmarks: safeJsonParse(row.bookmarks, []),
    history: safeJsonParse(row.history, []),
    profile: safeJsonParse(row.profile, {}),
    updatedAt: row.updatedAt,
  };
}

export function recoverAccount(recoveryCode: string, newSecret: string): { cloudId: string } | null {
  const row = db.prepare(`
    SELECT u.cloudId FROM users u JOIN recovery_codes r ON u.cloudId = r.cloudId WHERE r.code = ?
  `).get(recoveryCode) as { cloudId: string } | undefined;
  if (!row) return null;

  const hashed = hashSecret(normalizeSecret(newSecret));
  db.prepare('UPDATE users SET secret = ? WHERE cloudId = ?').run(hashed, row.cloudId);
  return { cloudId: row.cloudId };
}

export function getAccountInfo(cloudId: string) {
  const normalizedCloudId = normalizeCloudId(cloudId);
  return db.prepare('SELECT cloudId, createdAt FROM users WHERE cloudId = ?').get(normalizedCloudId) as { cloudId: string; createdAt: string } | undefined;
}

export function regenerateCredentials(cloudId: string, oldSecret: string, newSecret: string): boolean {
  const normalizedCloudId = normalizeCloudId(cloudId);
  if (!validateCredentials(normalizedCloudId, oldSecret)) return false;
  const hashed = hashSecret(normalizeSecret(newSecret));
  db.prepare('UPDATE users SET secret = ? WHERE cloudId = ?').run(hashed, normalizedCloudId);
  return true;
}

export function getRecoveryCodeByCloudId(cloudId: string): string | null {
  const normalizedCloudId = normalizeCloudId(cloudId);
  const row = db.prepare('SELECT code FROM recovery_codes WHERE cloudId = ?').get(normalizedCloudId) as { code: string } | undefined;
  return row?.code || null;
}

export function isCloudIdTaken(cloudId: string): boolean {
  const normalizedCloudId = normalizeCloudId(cloudId);
  return !!db.prepare('SELECT 1 FROM users WHERE cloudId = ?').get(normalizedCloudId);
}

const oauthInitTokens = new Map<string, { cloudId: string; createdAt: number }>();

const OAUTH_INIT_TTL = 5 * 60 * 1000;

export function createOAuthInitToken(cloudId: string): string {
  const normalizedCloudId = normalizeCloudId(cloudId);
  const token = randomBytes(16).toString('hex');
  oauthInitTokens.set(token, { cloudId: normalizedCloudId, createdAt: Date.now() });
  setTimeout(() => oauthInitTokens.delete(token), OAUTH_INIT_TTL);
  return token;
}

export function consumeOAuthInitToken(token: string): string | null {
  const entry = oauthInitTokens.get(token);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > OAUTH_INIT_TTL) {
    oauthInitTokens.delete(token);
    return null;
  }
  oauthInitTokens.delete(token);
  return entry.cloudId;
}

export function storeOAuthToken(cloudId: string, accessToken: string, username: string) {
  const normalizedCloudId = normalizeCloudId(cloudId);
  db.prepare(`
    INSERT INTO oauth_tokens (cloudId, accessToken, username)
    VALUES (?, ?, ?)
    ON CONFLICT(cloudId) DO UPDATE SET accessToken = excluded.accessToken, username = excluded.username
  `).run(normalizedCloudId, accessToken, username);
}

export function getOAuthToken(cloudId: string): { accessToken: string; username: string } | null {
  const normalizedCloudId = normalizeCloudId(cloudId);
  const row = db.prepare('SELECT accessToken, username FROM oauth_tokens WHERE cloudId = ?').get(normalizedCloudId) as any;
  return row || null;
}

function safeJsonParse(text: string, fallback: any): any {
  try { return JSON.parse(text); } catch { return fallback; }
}

export default db;
