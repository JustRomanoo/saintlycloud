"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSchema = initSchema;
exports.cloudIdPattern = cloudIdPattern;
exports.createUser = createUser;
exports.getDbPath = getDbPath;
exports.validateCredentials = validateCredentials;
exports.getUserAuthRow = getUserAuthRow;
exports.updateDeviceActivity = updateDeviceActivity;
exports.linkDevice = linkDevice;
exports.getDevices = getDevices;
exports.removeDevice = removeDevice;
exports.renameDevice = renameDevice;
exports.pushData = pushData;
exports.pullData = pullData;
exports.recoverAccount = recoverAccount;
exports.getAccountInfo = getAccountInfo;
exports.regenerateCredentials = regenerateCredentials;
exports.getRecoveryCodeByCloudId = getRecoveryCodeByCloudId;
exports.isCloudIdTaken = isCloudIdTaken;
exports.createOAuthInitToken = createOAuthInitToken;
exports.consumeOAuthInitToken = consumeOAuthInitToken;
exports.storeOAuthToken = storeOAuthToken;
exports.getOAuthToken = getOAuthToken;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const crypto_1 = require("crypto");
const path_1 = require("path");
const fs_1 = require("fs");
const DB_PATH = (0, path_1.resolve)(process.env.DATABASE_PATH || process.env.DB_PATH || './saintlycloud.db');
console.log(`[DB] Database path: ${DB_PATH}`);
console.log(`[DB] Database file exists: ${(0, fs_1.existsSync)(DB_PATH)}`);
const db = new better_sqlite3_1.default(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
function normalizeCloudId(cloudId) {
    return (cloudId || '').trim().toUpperCase();
}
function normalizeSecret(secret) {
    return (secret || '').trim();
}
function hashSecret(secret) {
    const salt = (0, crypto_1.randomBytes)(16).toString('hex');
    const hash = (0, crypto_1.scryptSync)(secret, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}
function verifySecret(secret, stored) {
    try {
        const parts = stored.split(':');
        if (parts.length !== 2)
            return false;
        const [salt, key] = parts;
        const hash = (0, crypto_1.scryptSync)(secret, salt, 64).toString('hex');
        return hash.length === key.length && (0, crypto_1.timingSafeEqual)(Buffer.from(hash), Buffer.from(key));
    }
    catch {
        return false;
    }
}
function generateCloudId() {
    const raw = (0, crypto_1.randomBytes)(4).toString('hex').toUpperCase();
    return `SA-CLD-${raw}`;
}
function generateRecoveryCode() {
    const seg1 = (0, crypto_1.randomBytes)(3).toString('hex');
    const seg2 = (0, crypto_1.randomBytes)(3).toString('hex');
    const seg3 = (0, crypto_1.randomBytes)(3).toString('hex');
    return `${seg1}-${seg2}-${seg3}`;
}
function initSchema() {
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
function cloudIdPattern() {
    return /^SA-CLD-[A-F0-9]{8}$/;
}
function createUser(secret) {
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
    console.log(`[User] Account created: ${cloudId}`);
    return { cloudId, recoveryCode };
}
function getDbPath() {
    return DB_PATH;
}
function validateCredentials(cloudId, secret) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const normalizedSecret = normalizeSecret(secret);
    const row = db.prepare('SELECT secret FROM users WHERE cloudId = ?').get(normalizedCloudId);
    if (!row) {
        console.log(`[Auth] User not found: ${normalizedCloudId}`);
        return false;
    }
    const valid = verifySecret(normalizedSecret, row.secret);
    console.log(`[Auth] Validation result for ${normalizedCloudId}: ${valid ? 'PASS' : 'FAIL'}`);
    return valid;
}
function getUserAuthRow(cloudId) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    return db.prepare('SELECT secret FROM users WHERE cloudId = ?').get(normalizedCloudId);
}
function updateDeviceActivity(cloudId, deviceId) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    if (deviceId) {
        db.prepare("UPDATE devices SET lastActive = datetime('now') WHERE deviceId = ? AND cloudId = ?").run(deviceId, normalizedCloudId);
    }
    else {
        db.prepare("UPDATE devices SET lastActive = datetime('now') WHERE cloudId = ?").run(normalizedCloudId);
    }
}
function linkDevice(cloudId, deviceId, deviceName) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const exists = db.prepare('SELECT 1 FROM users WHERE cloudId = ?').get(normalizedCloudId);
    if (!exists)
        return false;
    db.prepare(`
    INSERT INTO devices (deviceId, cloudId, name, lastActive)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(deviceId) DO UPDATE SET lastActive = datetime('now'), name = COALESCE(?, name)
  `).run(deviceId, normalizedCloudId, deviceName || 'Unknown Device', deviceName || null);
    return true;
}
function getDevices(cloudId) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    return db.prepare('SELECT deviceId, name, lastActive FROM devices WHERE cloudId = ? ORDER BY lastActive DESC').all(normalizedCloudId);
}
function removeDevice(cloudId, deviceId) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const result = db.prepare('DELETE FROM devices WHERE cloudId = ? AND deviceId = ?').run(normalizedCloudId, deviceId);
    return result.changes > 0;
}
function renameDevice(cloudId, deviceId, name) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const result = db.prepare('UPDATE devices SET name = ? WHERE cloudId = ? AND deviceId = ?').run(name, normalizedCloudId, deviceId);
    return result.changes > 0;
}
function mergeBookmarks(existing, incoming) {
    if (incoming === undefined)
        return JSON.stringify(existing);
    const map = new Map();
    for (const bm of existing) {
        if (bm?.animeId)
            map.set(bm.animeId, bm);
    }
    for (const bm of incoming) {
        if (!bm?.animeId)
            continue;
        const existing_bm = map.get(bm.animeId);
        if (!existing_bm || (bm.lastWatched || 0) >= (existing_bm.lastWatched || 0)) {
            map.set(bm.animeId, bm);
        }
    }
    return JSON.stringify(Array.from(map.values()));
}
function mergeHistory(existing, incoming) {
    if (incoming === undefined)
        return JSON.stringify(existing);
    const map = new Map();
    for (const h of existing) {
        if (h?.animeId)
            map.set(`${h.animeId}-${h.episode}`, h);
    }
    for (const h of incoming || []) {
        if (!h?.animeId)
            continue;
        const key = `${h.animeId}-${h.episode}`;
        const existing_h = map.get(key);
        if (!existing_h || (h.timestamp || 0) >= (existing_h.timestamp || 0)) {
            map.set(key, h);
        }
    }
    return JSON.stringify(Array.from(map.values()));
}
function pushData(cloudId, data) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const existing = db.prepare('SELECT bookmarks, history, profile, updatedAt FROM user_data WHERE cloudId = ?').get(normalizedCloudId);
    if (!existing) {
        console.log(`[Push] Account not found: ${normalizedCloudId}`);
        return false;
    }
    if (data.updatedAt && existing.updatedAt) {
        const incoming = new Date(data.updatedAt).getTime();
        const stored = new Date(existing.updatedAt).getTime();
        console.log(`[Push] updatedAt check: incoming=${incoming} stored=${stored} diff=${incoming - stored}ms`);
        if (incoming < stored) {
            console.log(`[Push] Skipping — incoming data is older than stored data`);
            return true;
        }
    }
    const existingBookmarks = safeJsonParse(existing.bookmarks, []);
    const existingHistory = safeJsonParse(existing.history, []);
    const bookmarks = mergeBookmarks(existingBookmarks, data.bookmarks);
    const history = mergeHistory(existingHistory, data.history);
    const profile = data.profile !== undefined ? JSON.stringify(data.profile) : existing.profile;
    db.prepare(`
    UPDATE user_data SET bookmarks = ?, history = ?, profile = ?, updatedAt = datetime('now') WHERE cloudId = ?
  `).run(bookmarks, history, profile, normalizedCloudId);
    console.log(`[Push] Data updated for ${normalizedCloudId}`);
    updateDeviceActivity(normalizedCloudId);
    return true;
}
function pullData(cloudId) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const row = db.prepare('SELECT bookmarks, history, profile, updatedAt FROM user_data WHERE cloudId = ?').get(normalizedCloudId);
    if (!row) {
        console.log(`[Pull] No data found for ${normalizedCloudId}`);
        return null;
    }
    const bookmarks = safeJsonParse(row.bookmarks, []);
    const history = safeJsonParse(row.history, []);
    const profile = safeJsonParse(row.profile, {});
    console.log(`[Pull] Data retrieved for ${normalizedCloudId}: bookmarks=${bookmarks.length} history=${history.length}`);
    return {
        bookmarks,
        history,
        profile,
        updatedAt: row.updatedAt,
    };
}
function recoverAccount(recoveryCode, newSecret) {
    const row = db.prepare(`
    SELECT u.cloudId FROM users u JOIN recovery_codes r ON u.cloudId = r.cloudId WHERE r.code = ?
  `).get(recoveryCode);
    if (!row)
        return null;
    const hashed = hashSecret(normalizeSecret(newSecret));
    db.prepare('UPDATE users SET secret = ? WHERE cloudId = ?').run(hashed, row.cloudId);
    return { cloudId: row.cloudId };
}
function getAccountInfo(cloudId) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    return db.prepare('SELECT cloudId, createdAt FROM users WHERE cloudId = ?').get(normalizedCloudId);
}
function regenerateCredentials(cloudId, oldSecret, newSecret) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    if (!validateCredentials(normalizedCloudId, oldSecret))
        return false;
    const hashed = hashSecret(normalizeSecret(newSecret));
    db.prepare('UPDATE users SET secret = ? WHERE cloudId = ?').run(hashed, normalizedCloudId);
    return true;
}
function getRecoveryCodeByCloudId(cloudId) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const row = db.prepare('SELECT code FROM recovery_codes WHERE cloudId = ?').get(normalizedCloudId);
    return row?.code || null;
}
function isCloudIdTaken(cloudId) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    return !!db.prepare('SELECT 1 FROM users WHERE cloudId = ?').get(normalizedCloudId);
}
const oauthInitTokens = new Map();
const OAUTH_INIT_TTL = 5 * 60 * 1000;
function createOAuthInitToken(cloudId) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const token = (0, crypto_1.randomBytes)(16).toString('hex');
    oauthInitTokens.set(token, { cloudId: normalizedCloudId, createdAt: Date.now() });
    setTimeout(() => oauthInitTokens.delete(token), OAUTH_INIT_TTL);
    return token;
}
function consumeOAuthInitToken(token) {
    const entry = oauthInitTokens.get(token);
    if (!entry)
        return null;
    if (Date.now() - entry.createdAt > OAUTH_INIT_TTL) {
        oauthInitTokens.delete(token);
        return null;
    }
    oauthInitTokens.delete(token);
    return entry.cloudId;
}
function storeOAuthToken(cloudId, accessToken, username) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    db.prepare(`
    INSERT INTO oauth_tokens (cloudId, accessToken, username)
    VALUES (?, ?, ?)
    ON CONFLICT(cloudId) DO UPDATE SET accessToken = excluded.accessToken, username = excluded.username
  `).run(normalizedCloudId, accessToken, username);
}
function getOAuthToken(cloudId) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const row = db.prepare('SELECT accessToken, username FROM oauth_tokens WHERE cloudId = ?').get(normalizedCloudId);
    return row || null;
}
function safeJsonParse(text, fallback) {
    try {
        return JSON.parse(text);
    }
    catch {
        return fallback;
    }
}
exports.default = db;
