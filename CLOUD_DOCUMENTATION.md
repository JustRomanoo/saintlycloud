# SaintlyCloud - Cloud Sync Platform

**Version:** 1.1.0  
**Status:** Production-Ready, Hardened  
**Tech Stack:** Node.js + Express + SQLite (backend), React + Vite + TypeScript (frontend)

---

## TABLE OF CONTENTS

1. [Architecture Overview](#architecture-overview)
2. [Directory Structure](#directory-structure)
3. [Database Schema](#database-schema)
4. [API Endpoints](#api-endpoints)
5. [Credential System](#credential-system)
6. [Authentication Flow](#authentication-flow)
7. [Recovery System](#recovery-system)
8. [Frontend Pages](#frontend-pages)
9. [AniList OAuth Endpoints](#anilist-oauth-endpoints)
10. [Production Deployment](#production-deployment)
11. [Integration with SaintlyAnime](#integration-with-saintlyanime)
12. [Security Model](#security-model)
13. [Setup & Running](#setup--running)

---

## ARCHITECTURE OVERVIEW

SaintlyCloud is a lightweight, credential-based cloud sync platform designed specifically for the SaintlyAnime ecosystem. It provides secure data synchronization across multiple devices without requiring email, passwords, or third-party authentication.

### Core Principles

- **No email/password** — Identity is managed via `cloudId` (public identifier) + `secret` (private key)
- **No streaming** — The cloud platform never provides or proxies anime streams
- **Local-first** — All anime playback remains local; cloud only syncs metadata (bookmarks, history, profile)
- **Minimal surface area** — 5 database tables, 13 API endpoints, 7 frontend pages
- **Zero-config SQLite** — Backend uses better-sqlite3 for instant setup (swappable to PostgreSQL)
- **Hashed secrets** — Secrets are hashed with scrypt + random salt before storage; plaintext never persisted
- **Conflict-resolved sync** — Timestamp-based conflict resolution prevents older data overwriting newer data
- **Rate-limited** — Sensitive endpoints protected by rate limiting (5 req/min/IP)

### Data Flow

```
SaintlyAnime Desktop  ←→  SaintlyCloud API  ←→  SaintlyCloud Dashboard
       │                        │
       │                        ▼
       │                 SQLite Database
       │            (bookmarks, history, profile)
       │
       ▼
  Local IndexedDB
 (primary storage)
```

---

## DIRECTORY STRUCTURE

```
saintlycloud/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express server entry point
│   │   ├── db.ts                 # SQLite database layer (CRUD)
│   │   └── routes/
│   │       ├── auth.ts           # Account creation, validation, recovery
│   │       ├── sync.ts           # Data push/pull endpoints
│   │       ├── devices.ts        # Device management endpoints
│   │       └── oauth.ts          # AniList OAuth token storage
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Root app with routing + session management
│   │   ├── main.tsx              # React entry point
│   │   ├── index.css             # Dark theme styles (SaintlyAnime consistent)
│   │   ├── lib/
│   │   │   └── api.ts            # API client with typed functions
│   │   ├── components/
│   │   │   └── Sidebar.tsx       # Navigation sidebar
│   │   └── pages/
│   │       ├── Auth.tsx          # Login, Create Account, Recover
│   │       ├── Dashboard.tsx     # Cloud status, Cloud ID, stats
│   │       ├── Bookmarks.tsx     # Read-only bookmark view
│   │       ├── SyncSettings.tsx  # Sync toggles + push/pull actions
│   │       ├── Devices.tsx       # Device list, rename, remove
│   │       ├── Stats.tsx         # Usage statistics
│   │       ├── Recovery.tsx      # Credential management + recovery code
│   │       └── OAuthCallback.tsx # AniList OAuth redirect handler
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts            # Dev proxy to backend :3721
│   ├── vercel.json               # Vercel deployment config
│   └── tsconfig.json
│
└── CLOUD_DOCUMENTATION.md        # This file
```

---

## DATABASE SCHEMA

### Table: `users`

| Column    | Type   | Description                                             |
|-----------|--------|---------------------------------------------------------|
| cloudId   | TEXT PK | Formatted ID (e.g., `SA-CLD-A1B2C3D4`), public identifier |
| secret    | TEXT   | Scrypt-hashed secret (salt:hash format, never plaintext)  |
| createdAt | TEXT   | ISO timestamp of account creation                        |

### Table: `devices`

| Column    | Type   | Description                          |
|-----------|--------|--------------------------------------|
| deviceId  | TEXT PK | UUID identifying the device          |
| cloudId   | TEXT FK | References users.cloudId (CASCADE)   |
| name      | TEXT   | Human-readable device name           |
| lastActive| TEXT   | ISO timestamp of last activity       |

### Table: `user_data`

| Column    | Type   | Description                          |
|-----------|--------|--------------------------------------|
| cloudId   | TEXT PK | References users.cloudId (CASCADE)   |
| bookmarks | JSONB  | Array of bookmark objects             |
| history   | JSONB  | Array of watch history entries        |
| profile   | JSONB  | Single profile object                 |
| updatedAt | TEXT   | ISO timestamp of last update          |

### Table: `oauth_tokens`

| Column | Type | Description |
|--------|------|-------------|
| cloudId | TEXT PK | References users.cloudId (CASCADE) |
| accessToken | TEXT | AniList OAuth access token |
| username | TEXT | AniList username |
| createdAt | TEXT | ISO timestamp of token creation |

### Table: `recovery_codes`

| Column    | Type   | Description                          |
|-----------|--------|--------------------------------------|
| cloudId   | TEXT PK | References users.cloudId (CASCADE)   |
| code      | TEXT   | Recovery code (3 UUID segments joined) |

### Entity Relationships

```
users (1) ──→ (N) devices
users (1) ──→ (1) user_data
users (1) ──→ (1) recovery_codes
users (1) ──→ (1) oauth_tokens
```

All child tables use `ON DELETE CASCADE` — deleting a user removes all associated data.

---

## API ENDPOINTS

Base URL: `http://localhost:3721/api`

### Response Format

All endpoints return a standardized JSON structure:

**Success:**
```json
{ "success": true, ...data }
```

**Error:**
```json
{ "success": false, "error": "message", "details": "optional" }
```

### Rate Limiting

The following endpoints are rate-limited to **5 requests per minute per IP**:
- `POST /create-account`
- `POST /recover`
- `POST /link-device`

Exceeding the limit returns `429 Too Many Requests`:
```json
{ "success": false, "error": "Too many requests. Try again in a minute." }
```

### Authentication

#### `POST /create-account`
Create a new cloud account.
- **Rate limited:** 5/min/IP
- **Input validation:** deviceId (string), secret (8-256 chars), deviceName (optional, max 100 chars)
- **cloudId pattern:** `SA-CLD-XXXXXXXX` (auto-generated)

**Request:**
```json
{ "deviceId": "uuid", "secret": "mypassword", "deviceName": "My PC" }
```

**Response:**
```json
{ "success": true, "cloudId": "SA-CLD-A1B2C3D4", "recoveryCode": "abc-def-ghi" }
```

**Errors:** `400` missing/invalid fields, `429` rate limit exceeded

---

#### `POST /validate`
Validate credentials and get account info.

**Request:**
```json
{ "cloudId": "SA-CLD-A1B2C3D4", "secret": "mypassword" }
```

**Response:**
```json
{ "success": true, "cloudId": "SA-CLD-A1B2C3D4", "createdAt": "2026-05-12 12:00:00" }
```

**Errors:** `401` invalid credentials

---

#### `POST /link-device`
Link a new device to an existing account.
- **Rate limited:** 5/min/IP

**Request:**
```json
{ "cloudId": "SA-CLD-A1B2C3D4", "secret": "mypassword", "deviceId": "uuid", "deviceName": "Laptop" }
```

**Response:**
```json
{ "success": true, "cloudId": "SA-CLD-A1B2C3D4" }
```

**Errors:** `401` invalid credentials, `429` rate limit exceeded

---

#### `GET /account/:cloudId`
Get account metadata (requires `x-secret` header).

**Headers:** `x-secret: mypassword`

**Response:**
```json
{ "success": true, "cloudId": "SA-CLD-A1B2C3D4", "createdAt": "2026-05-12 12:00:00" }
```

---

### Sync

#### `POST /sync/push`
Upload data to the cloud. Supports timestamp-based conflict resolution — if the incoming `updatedAt` is older than the stored value, the push is accepted but data is NOT overwritten.

**Request:**
```json
{
  "cloudId": "SA-CLD-A1B2C3D4",
  "secret": "mypassword",
  "data": {
    "bookmarks": [...],
    "history": [...],
    "profile": {...},
    "updatedAt": "2026-05-12T12:30:00Z"
  }
}
```

All fields in `data` are optional — only provided fields are updated.  
**Header:** `x-device-id` (optional) — updates device lastActive time.

**Input validation:**
- `bookmarks` must be an array of objects
- `history` must be an array
- `profile` must be a single object

**Response:** `{ "success": true }`

---

#### `GET /sync/pull`
Download data from the cloud. Also updates device lastActive timestamp.

**Query:** `?cloudId=SA-CLD-A1B2C3D4`  
**Headers:** `x-secret: mypassword`, `x-device-id` (optional)

**Response:**
```json
{
  "success": true,
  "bookmarks": [...],
  "history": [...],
  "profile": {...},
  "updatedAt": "2026-05-12 12:30:00"
}
```

---

### Devices

#### `GET /devices`
List linked devices (requires `x-secret` header).

**Query:** `?cloudId=SA-CLD-A1B2C3D4`  
**Headers:** `x-secret: mypassword`

**Response:**
```json
{
  "success": true,
  "devices": [
    { "deviceId": "uuid", "name": "My PC", "lastActive": "..." }
  ]
}
```

---

#### `POST /devices/remove`
Remove a linked device.

**Request:**
```json
{ "cloudId": "SA-CLD-A1B2C3D4", "secret": "mypassword", "deviceId": "uuid" }
```

**Response:** `{ "success": true }`

---

#### `POST /devices/rename`
Rename a linked device. Name must be 1-100 characters.

**Request:**
```json
{ "cloudId": "SA-CLD-A1B2C3D4", "secret": "mypassword", "deviceId": "uuid", "name": "New Name" }
```

**Response:** `{ "success": true }`

---

### Recovery

#### `POST /recover`
Recover account using recovery code (generates new secret).
- **Rate limited:** 5/min/IP

**Request:**
```json
{ "recoveryCode": "abc-def-ghi", "newSecret": "newpassword" }
```

**Response:** `{ "success": true, "cloudId": "SA-CLD-A1B2C3D4" }`

---

#### `POST /regenerate`
Change secret (requires old secret). New secret must be 8-256 characters.

**Request:**
```json
{ "cloudId": "SA-CLD-A1B2C3D4", "oldSecret": "oldpassword", "newSecret": "newpassword" }
```

**Response:** `{ "success": true }`

---

#### `GET /recovery-code/:cloudId`
Retrieve the recovery code (requires `x-secret` header).

**Headers:** `x-secret: mypassword`

**Response:**
```json
{ "success": true, "code": "abc-def-ghi" }
```

---

### Health

Two health endpoints are available. Use `/health` for simple monitoring/liveness checks, and `/api/health` for detailed diagnostics including uptime and version info.

#### `GET /health`

Minimal liveness check — no authentication required. Returns instantly regardless of database state. Suitable for load balancers, container orchestrators, and uptime monitors.

**Response:**
```json
{
  "status": "ok",
  "service": "saintlycloud",
  "timestamp": "2026-05-12T17:30:00.000Z"
}
```

#### `GET /api/health`

Detailed health check — includes version, uptime, and environment metadata. Useful for deployment verification and debugging.

**Response:**
```json
{
  "success": true,
  "status": "ok",
  "service": "saintlycloud",
  "version": "1.1.0",
  "uptime": 3600,
  "environment": "production",
  "timestamp": "2026-05-12T17:30:00.000Z"
}
```

---

## CREDENTIAL SYSTEM

SaintlyCloud uses a two-part credential system + recovery code:

| Credential | Format | Purpose |
|-----------|--------|---------|
| **cloudId** | `SA-CLD-XXXXXXXX` (prefixed hex) | Public identifier, safe to share |
| **secret** | User-chosen string (8-256 chars) | Private key, never exposed |
| **recoveryCode** | `xxxxxx-xxxxxx-xxxxxx` (3 hex segments) | One-time recovery, shown once at creation |

### Rules

- `cloudId` is auto-generated and guaranteed unique (uses `randomBytes` + collision check)
- `secret` is **never stored in plaintext** — hashed with scrypt + 16-byte random salt using Node.js built-in `crypto.scryptSync`
- Secret verification uses `timingSafeEqual` to prevent timing attacks
- `recoveryCode` is generated at account creation and stored in plaintext (only recovery mechanism)
- There is no password reset flow without the recovery code
- Regenerating credentials invalidates the old secret immediately

### Credential Validation Logic

All credential validation follows this consistent flow:

1. **Normalization** — Input is normalized before any hashing or verification:
   - `cloudId`: trimmed and uppercased via `normalizeCloudId()` (`(input || '').trim().toUpperCase()`)
   - `secret`: trimmed via `normalizeSecret()` (`(input || '').trim()`)
   - Normalization happens both in route handlers and in `db.ts` utility functions for defense-in-depth

2. **Hashing** (on create/recover/regenerate):
   - `hashSecret(secret)` generates a 16-byte random salt (`crypto.randomBytes(16).toString('hex')`)
   - Produces a 64-byte scrypt hash: `crypto.scryptSync(secret, salt, 64).toString('hex')`
   - Stored as `salt:hash` format

3. **Verification** (on validate/link-device/sync/devices/oauth):
   - `verifySecret(secret, stored)` splits stored value by `:` to extract `salt` and `key`
   - Recomputes hash: `crypto.scryptSync(secret, salt, 64).toString('hex')`
   - Compares using `crypto.timingSafeEqual` (preceded by length check to avoid allocation errors)

4. **Double normalization** — Both route handlers and DB functions normalize independently, ensuring consistency even if one layer changes

5. **What NOT to do:**
   - ❌ Never compare raw secret to hashed string
   - ❌ Never re-hash and compare hashes (must derive hash from input + stored salt)
   - ❌ Never skip normalization on one path but apply it on another

---

## AUTHENTICATION FLOW

### New Account Flow

```
1. User chooses a secret (min 8 characters)
2. Frontend calls POST /create-account  →  body: { deviceId, secret, deviceName }
3. Backend normalizes secret (trim) and deviceId (trim)
4. Backend normalizes secret again via normalizeSecret() (trim)
5. Backend hashes normalized secret with scrypt + random salt → stored as "salt:hash"
6. Backend generates cloudId + recoveryCode, stores them
7. Frontend receives cloudId + recoveryCode
8. User MUST save the recoveryCode (shown once)
9. User is logged in automatically
```

### Existing Account Flow

```
1. User enters cloudId + secret
2. Frontend calls POST /validate  →  body: { cloudId, secret }
3. Backend normalizes cloudId (trim + uppercase) and secret (trim) in route handler
4. Backend normalizes cloudId and secret again via normalizeCloudId() + normalizeSecret()
5. Backend queries user by normalized cloudId
6. Backend extracts salt from stored "salt:hash", recomputes hash with input secret
7. Backend compares computed hash vs stored hash using timingSafeEqual
8. If match → session established with { success: true, cloudId, createdAt }
9. If no match → 401 "Invalid credentials"
10. Session stored in sessionStorage
11. All subsequent API calls include credentials
```

### Session Management

- Session (cloudId + secret) is stored in `sessionStorage`
- Cleared on disconnect or tab close
- No JWT tokens, no cookies
- Every API call validates credentials server-side

---

## RECOVERY SYSTEM

If a user loses their secret:

```
1. User clicks "Recover Account" on the login page
2. User enters their recovery code + a new secret
3. Frontend calls POST /recover
4. Backend validates the recovery code
5. Backend updates the secret to the new value
6. User logs in with the new secret
```

The recovery code is the ONLY way to regain access. There is no email reset, no support ticket, no admin override.

---

## FRONTEND PAGES

| Page | Route | Description |
|------|-------|-------------|
| **Auth** | (landing) | Login, create account, recover account |
| **Dashboard** | nav | Cloud ID, device count, bookmark count, last sync |
| **Bookmarks** | nav | Read-only list of synced bookmarks with status |
| **Sync Settings** | nav | Toggle sync types, push/pull buttons |
| **Devices** | nav | List linked devices, rename, remove |
| **Stats** | nav | Anime/episode counts, device count, account age |
| **Recovery** | nav | View/mask secret, reveal recovery code, regenerate credentials |
| **OAuthCallback** | URL hash | Handles AniList OAuth redirect, stores token, redirects to dashboard |

All pages share:
- Dark theme (#020202 background, #8a5fff accent)
- Glassmorphism panels
- Consistent with SaintlyAnime desktop design language

---

## ANILIST OAUTH ENDPOINTS

SaintlyCloud provides optional AniList OAuth token storage so connected devices can share a single AniList authorization.

### `POST /api/oauth/store`
Store an AniList OAuth access token for a cloud account.

**Request:**
```json
{ "cloudId": "SA-CLD-XXXXXXXX", "secret": "mypassword", "accessToken": "...", "username": "anilist_user" }
```

**Response:** `{ "success": true, "stored": true }`

### `GET /api/oauth/token`
Retrieve the stored AniList OAuth token.

**Query:** `?cloudId=SA-CLD-XXXXXXXX`
**Headers:** `x-secret: mypassword`

**Response:** `{ "success": true, "accessToken": "...", "username": "anilist_user" }`

### OAuth Redirect Flow

The frontend handles AniList OAuth redirects at `/oauth`:
1. AniList redirects to `https://your-frontend-domain.com/#access_token=TOKEN`
2. The `OAuthCallback` page extracts the token from the URL hash
3. Verifies the token against AniList GraphQL API
4. Stores the token via `POST /api/oauth/store`
5. Redirects to the dashboard

**AniList Redirect URI Configuration:**
```
https://your-frontend-domain.com/
```
Note: Use the frontend URL (not the API URL) as the AniList redirect URI. The token is extracted client-side from the URL hash.

---

## PRODUCTION DEPLOYMENT

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3721` | Backend server port |
| `NODE_ENV` | `development` | Set to `production` to disable verbose logging |
| `DATABASE_PATH` | `./saintlycloud.db` | SQLite database file path (alias: `DB_PATH`) |
| `CORS_ORIGIN` | `http://localhost:5174,http://localhost:4173,http://localhost:3721` | Comma-separated allowed CORS origins |
| `VITE_API_URL` | `/api` | Frontend API base URL (set to backend URL in production) |

### Hosting Backend (Railway / Render / Fly.io)

The backend is a standard Node.js + Express application. SQLite works on all major hosting platforms.

**Build Command:** `npm run build`
**Start Command:** `npm start`
**Node Version:** `>=18`

**Deployment Steps:**
1. Set `NODE_ENV=production` in environment
2. Set `PORT` to the platform's assigned port (Railway/Render provide this automatically via `PORT` env)
3. Set `CORS_ORIGIN` to your frontend domain(s), comma-separated
4. Ensure `DATABASE_PATH` points to a persistent volume (for platforms that support it)
5. For ephemeral filesystems (Render free tier, Fly.io), the SQLite database resets on restart — data is safe since sync is designed to be lossy (clients repush data)

**Railway-specific:**
- Build: `npm run build`
- Start: `npm start`
- Volumes: Not required (data can be restored from any connected client)

**Render-specific:**
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Disk persistence: Use Render's persistent disk option for SQLite durability

### Hosting Frontend (Vercel / Netlify)

The frontend is a standard Vite React SPA.

**Build Command:** `npm run build`
**Output Directory:** `dist`
**Node Version:** `>=18`

**Vercel (recommended):**
1. Import the `saintlycloud/frontend` directory as a project
2. Set `VITE_API_URL` to your deployed backend URL (e.g., `https://saintlycloud-api.onrender.com/api`)
3. Deploy — the `vercel.json` handles SPA routing

**Netlify:**
1. Set build command to `npm run build`
2. Set publish directory to `dist`
3. Add `/* /index.html 200` redirect rule for SPA support
4. Set `VITE_API_URL` environment variable

### Architecture Diagram (Production)

```
Internet
   │
   ▼
┌─────────────────────┐     ┌─────────────────────┐
│  Vercel (Frontend)  │     │  Railway/Render     │
│  saintlycloud.com   │────▶│  saintlycloud-api   │
│                     │     │  .com:3721          │
│  VITE_API_URL =     │     │                     │
│  https://.../api    │     │  SQLite Database    │
└─────────────────────┘     └─────────────────────┘
        │                           │
        │                           ▼
        │                    Persistent Disk
        │                    (optional for SQLite)
        │
   ┌────┴────┐
   │ Desktop │
   │ App     │
   │ (Tauri) │
   └─────────┘
```

### Security Considerations

| Concern | Production Configuration |
|---------|-------------------------|
| **HTTPS** | Enable on your hosting platform (standard on Vercel/Railway/Render) |
| **CORS** | Restrict to your frontend domain(s) via `CORS_ORIGIN` |
| **Rate Limiting** | Active in production — 5 req/min on auth endpoints |
| **Secret Hashing** | scrypt + salt — active in all environments |
| **Trust Proxy** | `app.set('trust proxy', 1)` — active in production for correct IP detection behind reverse proxies |
| **Logging** | Request logging disabled in production; only error logs emitted |
| **OAuth Tokens** | Stored in database, scoped to cloudId, require valid credentials to access |

---

## INTEGRATION WITH SAINTLYANIME

### From the Desktop App

The desktop SaintlyAnime app can integrate via the API client:

```typescript
// Example integration in SaintlyAnime settings
import { pushData, pullData } from './saintlycloud/api';

// Push local data to cloud
await pushData(
  { cloudId: 'your-id', secret: 'your-secret' },
  {
    bookmarks: await getBookmarks(),
    history: await getHistory(),
    profile: await getProfile(),
  }
);

// Pull cloud data to local
const cloudData = await pullData(
  { cloudId: 'your-id', secret: 'your-secret' }
);
```

### Data Mapping

SaintlyCloud stores data in the same format as SaintlyAnime's IndexedDB:

| Source Field | Cloud Field | Type |
|-------------|-------------|------|
| `BookmarkData.animeId` | `bookmarks[].animeId` | string |
| `BookmarkData.animeTitle` | `bookmarks[].animeTitle` | string |
| `BookmarkData.animeCover` | `bookmarks[].animeCover` | string |
| `BookmarkData.status` | `bookmarks[].status` | "Watching" | "Completed" | "Planned" | "Dropped" | "On Hold" |
| `BookmarkData.currentEpisode` | `bookmarks[].currentEpisode` | number |
| `BookmarkData.progress` | `bookmarks[].progress` | number (0-100) |
| `WatchHistoryEntry` | `history[]` | object |
| `ProfileData` | `profile` | object |

---

## SECURITY MODEL

| Concern | Implementation |
|---------|---------------|
| **Authentication** | cloudId + secret validated on every request |
| **Credential storage** | Secrets hashed with scrypt + 16-byte random salt; plaintext never persisted |
| **Recovery** | Single-use recovery code, one-time display at creation |
| **Device trust** | No device trust model — any device with valid credentials is authorized |
| **Data isolation** | All queries scoped by cloudId |
| **CORS** | Restricted to configured origins via `CORS_ORIGIN` env var |
| **Transport** | HTTPS recommended in production (handled by hosting platform) |
| **Rate Limiting** | 5 requests/min on `POST /create-account`, `/recover`, `/link-device` |
| **Secret verification** | Uses `timingSafeEqual` to prevent timing attacks |
| **Input validation** | All inputs validated for type, length, and format before processing |
| **Logging** | Secrets never logged; verbose logging disabled in production |

### Known Limitations

- No email/password system (by design)
- Session tokens are the raw secret (no JWT indirection)
- Rate limiting only applies to auth endpoints (sync endpoints are unthrottled)

---

## SETUP & RUNNING

### Backend

```bash
cd saintlycloud/backend
npm install
npm run dev
# Server starts on http://localhost:3721
# SQLite database created at saintlycloud.db
```

### Frontend

```bash
cd saintlycloud/frontend
npm install
npm run dev
# Dev server starts on http://localhost:5174
# API requests proxy to :3721 via Vite config
```

### Production Build

```bash
# Backend
cd saintlycloud/backend
npm install
npm run build
NODE_ENV=production npm start

# Frontend (serve via Vercel)
cd saintlycloud/frontend
npm install
VITE_API_URL=https://your-backend.com/api npm run build
# Output in dist/ — serve with any static server
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3721` | Backend server port |
| `NODE_ENV` | `development` | Set to `production` for deployment |
| `DATABASE_PATH` | `./saintlycloud.db` | SQLite database file path (alias: `DB_PATH`) |
| `CORS_ORIGIN` | `http://localhost:5174,http://localhost:4173,http://localhost:3721` | Comma-separated allowed CORS origins |
