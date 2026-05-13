"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSchema = initSchema;
exports.getDbStatus = getDbStatus;
exports.cloudIdPattern = cloudIdPattern;
exports.createUser = createUser;
exports.validateCredentials = validateCredentials;
exports.getAccountInfo = getAccountInfo;
exports.recoverAccount = recoverAccount;
exports.regenerateCredentials = regenerateCredentials;
exports.getRecoveryCodeByCloudId = getRecoveryCodeByCloudId;
exports.linkDevice = linkDevice;
exports.updateDeviceActivity = updateDeviceActivity;
exports.getDevices = getDevices;
exports.removeDevice = removeDevice;
exports.renameDevice = renameDevice;
exports.pushData = pushData;
exports.pullData = pullData;
exports.createOAuthInitToken = createOAuthInitToken;
exports.consumeOAuthInitToken = consumeOAuthInitToken;
exports.storeOAuthToken = storeOAuthToken;
exports.getOAuthToken = getOAuthToken;
const pg_1 = require("pg");
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = require("crypto");
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('[DB] FATAL: DATABASE_URL environment variable is not set');
    process.exit(1);
}
console.log(`[DB] Connecting to PostgreSQL...`);
const pool = new pg_1.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});
pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
});
async function initSchema() {
    const client = await pool.connect();
    try {
        await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        cloud_id TEXT UNIQUE NOT NULL,
        secret TEXT NOT NULL,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_cloud_id ON users(cloud_id);
    `);
        console.log(`[DB] Schema initialized — users table ready`);
    }
    finally {
        client.release();
    }
}
async function getDbStatus() {
    try {
        const result = await pool.query('SELECT COUNT(*)::int AS count FROM users');
        return { connected: true, userCount: result.rows[0]?.count || 0 };
    }
    catch {
        return { connected: false, userCount: 0 };
    }
}
function cloudIdPattern() {
    return /^SA-CLD-[A-F0-9]{8}$/;
}
function normalizeCloudId(cloudId) {
    return (cloudId || '').trim().toUpperCase();
}
function normalizeSecret(secret) {
    return (secret || '').trim();
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
// ── Users ──
async function createUser(secret) {
    const cloudId = generateCloudId();
    const recoveryCode = generateRecoveryCode();
    const hashed = await bcrypt_1.default.hash(normalizeSecret(secret), 10);
    const data = {
        bookmarks: [],
        history: [],
        profile: { username: 'Saintly Viewer', avatar: '', banner: '', frame: '', accent: '#8a5fff' },
        updatedAt: new Date().toISOString(),
        devices: [],
        recoveryCode,
    };
    await pool.query(`INSERT INTO users (cloud_id, secret, data) VALUES ($1, $2, $3)`, [cloudId, hashed, JSON.stringify(data)]);
    console.log(`[User] Account created: ${cloudId}`);
    return { cloudId, recoveryCode };
}
async function validateCredentials(cloudId, secret) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const normalizedSecret = normalizeSecret(secret);
    const result = await pool.query(`SELECT secret FROM users WHERE cloud_id = $1`, [normalizedCloudId]);
    if (result.rows.length === 0) {
        console.log(`[Auth] User not found: ${normalizedCloudId}`);
        return false;
    }
    const valid = await bcrypt_1.default.compare(normalizedSecret, result.rows[0].secret);
    console.log(`[Auth] Validation result for ${normalizedCloudId}: ${valid ? 'PASS' : 'FAIL'}`);
    return valid;
}
async function getAccountInfo(cloudId) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const result = await pool.query(`SELECT cloud_id, created_at FROM users WHERE cloud_id = $1`, [normalizedCloudId]);
    if (result.rows.length === 0)
        return undefined;
    return { cloudId: result.rows[0].cloud_id, createdAt: result.rows[0].created_at };
}
async function recoverAccount(recoveryCode, newSecret) {
    const result = await pool.query(`SELECT cloud_id, data FROM users WHERE data->>'recoveryCode' = $1`, [recoveryCode]);
    if (result.rows.length === 0)
        return null;
    const hashed = await bcrypt_1.default.hash(normalizeSecret(newSecret), 10);
    await pool.query(`UPDATE users SET secret = $1 WHERE cloud_id = $2`, [hashed, result.rows[0].cloud_id]);
    return { cloudId: result.rows[0].cloud_id };
}
async function regenerateCredentials(cloudId, oldSecret, newSecret) {
    const valid = await validateCredentials(cloudId, oldSecret);
    if (!valid)
        return false;
    const hashed = await bcrypt_1.default.hash(normalizeSecret(newSecret), 10);
    const normalizedCloudId = normalizeCloudId(cloudId);
    await pool.query(`UPDATE users SET secret = $1 WHERE cloud_id = $2`, [hashed, normalizedCloudId]);
    return true;
}
async function getRecoveryCodeByCloudId(cloudId) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const result = await pool.query(`SELECT data FROM users WHERE cloud_id = $1`, [normalizedCloudId]);
    if (result.rows.length === 0)
        return null;
    return result.rows[0].data?.recoveryCode || null;
}
// ── Devices ──
async function linkDevice(cloudId, deviceId, deviceName) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const userResult = await pool.query(`SELECT data FROM users WHERE cloud_id = $1`, [normalizedCloudId]);
    if (userResult.rows.length === 0)
        return false;
    const data = userResult.rows[0].data || {};
    const devices = data.devices || [];
    const existingIdx = devices.findIndex((d) => d.deviceId === deviceId);
    if (existingIdx >= 0) {
        devices[existingIdx].lastActive = new Date().toISOString();
        if (deviceName)
            devices[existingIdx].name = deviceName;
    }
    else {
        devices.push({
            deviceId,
            name: deviceName || 'Unknown Device',
            lastActive: new Date().toISOString(),
        });
    }
    await pool.query(`UPDATE users SET data = jsonb_set(data, '{devices}', $1::jsonb) WHERE cloud_id = $2`, [JSON.stringify(devices), normalizedCloudId]);
    return true;
}
async function updateDeviceActivity(cloudId, deviceId) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const userResult = await pool.query(`SELECT data FROM users WHERE cloud_id = $1`, [normalizedCloudId]);
    if (userResult.rows.length === 0)
        return;
    const data = userResult.rows[0].data || {};
    const devices = data.devices || [];
    if (deviceId) {
        const dev = devices.find((d) => d.deviceId === deviceId);
        if (dev)
            dev.lastActive = new Date().toISOString();
    }
    else {
        for (const dev of devices) {
            dev.lastActive = new Date().toISOString();
        }
    }
    await pool.query(`UPDATE users SET data = jsonb_set(data, '{devices}', $1::jsonb) WHERE cloud_id = $2`, [JSON.stringify(devices), normalizedCloudId]);
}
async function getDevices(cloudId) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const result = await pool.query(`SELECT data FROM users WHERE cloud_id = $1`, [normalizedCloudId]);
    if (result.rows.length === 0)
        return [];
    const devices = result.rows[0].data?.devices || [];
    return devices.sort((a, b) => (b.lastActive || '').localeCompare(a.lastActive || ''));
}
async function removeDevice(cloudId, deviceId) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const userResult = await pool.query(`SELECT data FROM users WHERE cloud_id = $1`, [normalizedCloudId]);
    if (userResult.rows.length === 0)
        return false;
    const data = userResult.rows[0].data || {};
    const devices = (data.devices || []).filter((d) => d.deviceId !== deviceId);
    if (devices.length === (data.devices || []).length)
        return false;
    await pool.query(`UPDATE users SET data = jsonb_set(data, '{devices}', $1::jsonb) WHERE cloud_id = $2`, [JSON.stringify(devices), normalizedCloudId]);
    return true;
}
async function renameDevice(cloudId, deviceId, name) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const userResult = await pool.query(`SELECT data FROM users WHERE cloud_id = $1`, [normalizedCloudId]);
    if (userResult.rows.length === 0)
        return false;
    const data = userResult.rows[0].data || {};
    const devices = data.devices || [];
    const dev = devices.find((d) => d.deviceId === deviceId);
    if (!dev)
        return false;
    dev.name = name;
    await pool.query(`UPDATE users SET data = jsonb_set(data, '{devices}', $1::jsonb) WHERE cloud_id = $2`, [JSON.stringify(devices), normalizedCloudId]);
    return true;
}
// ── Sync (Push / Pull) ──
function mergeBookmarks(existing, incoming) {
    if (incoming === undefined)
        return existing;
    const map = new Map();
    for (const bm of existing) {
        if (bm?.animeId)
            map.set(bm.animeId, bm);
    }
    for (const bm of incoming) {
        if (!bm?.animeId)
            continue;
        const existingBm = map.get(bm.animeId);
        if (!existingBm || (bm.lastWatched || 0) >= (existingBm.lastWatched || 0)) {
            map.set(bm.animeId, bm);
        }
    }
    return Array.from(map.values());
}
function mergeHistory(existing, incoming) {
    if (incoming === undefined)
        return existing;
    const map = new Map();
    for (const h of existing) {
        if (h?.animeId)
            map.set(`${h.animeId}-${h.episode}`, h);
    }
    for (const h of incoming || []) {
        if (!h?.animeId)
            continue;
        const key = `${h.animeId}-${h.episode}`;
        const existingH = map.get(key);
        if (!existingH || (h.timestamp || 0) >= (existingH.timestamp || 0)) {
            map.set(key, h);
        }
    }
    return Array.from(map.values());
}
async function pushData(cloudId, incoming) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const result = await pool.query(`SELECT data FROM users WHERE cloud_id = $1`, [normalizedCloudId]);
    if (result.rows.length === 0) {
        console.log(`[Push] Account not found: ${normalizedCloudId}`);
        return false;
    }
    const currentData = result.rows[0].data || {};
    const storedUpdatedAt = currentData.updatedAt;
    if (incoming.updatedAt && storedUpdatedAt) {
        const incomingTs = new Date(incoming.updatedAt).getTime();
        const storedTs = new Date(storedUpdatedAt).getTime();
        console.log(`[Push] updatedAt check: incoming=${incomingTs} stored=${storedTs} diff=${incomingTs - storedTs}ms`);
        if (incomingTs < storedTs) {
            console.log(`[Push] Skipping — incoming data is older than stored data`);
            return true;
        }
    }
    const existingBookmarks = currentData.bookmarks || [];
    const existingHistory = currentData.history || [];
    currentData.bookmarks = mergeBookmarks(existingBookmarks, incoming.bookmarks);
    currentData.history = mergeHistory(existingHistory, incoming.history);
    if (incoming.profile !== undefined) {
        currentData.profile = incoming.profile;
    }
    currentData.updatedAt = new Date().toISOString();
    await pool.query(`UPDATE users SET data = $1::jsonb WHERE cloud_id = $2`, [JSON.stringify(currentData), normalizedCloudId]);
    console.log(`[Push] Data updated for ${normalizedCloudId}`);
    await updateDeviceActivity(normalizedCloudId);
    return true;
}
async function pullData(cloudId) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const result = await pool.query(`SELECT data FROM users WHERE cloud_id = $1`, [normalizedCloudId]);
    if (result.rows.length === 0) {
        console.log(`[Pull] No data found for ${normalizedCloudId}`);
        return null;
    }
    const data = result.rows[0].data || {};
    const bookmarks = data.bookmarks || [];
    const history = data.history || [];
    const profile = data.profile || {};
    const updatedAt = data.updatedAt || '';
    console.log(`[Pull] Data retrieved for ${normalizedCloudId}: bookmarks=${bookmarks.length} history=${history.length}`);
    return { bookmarks, history, profile, updatedAt };
}
// ── OAuth ──
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
async function storeOAuthToken(cloudId, accessToken, username) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    await pool.query(`UPDATE users SET data = jsonb_set(data, '{oauthToken}', $1::jsonb) WHERE cloud_id = $2`, [JSON.stringify({ accessToken, username }), normalizedCloudId]);
}
async function getOAuthToken(cloudId) {
    const normalizedCloudId = normalizeCloudId(cloudId);
    const result = await pool.query(`SELECT data FROM users WHERE cloud_id = $1`, [normalizedCloudId]);
    if (result.rows.length === 0)
        return null;
    return result.rows[0].data?.oauthToken || null;
}
