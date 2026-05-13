# SaintlyCloud - Cloud Sync Platform

**Version:** 1.2.0  
**Status:** Production-Ready, PostgreSQL  
**Tech Stack:** Node.js + Express + PostgreSQL (backend), React + Vite + TypeScript (frontend)

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
- **Minimal surface area** — 1 database table, 13 API endpoints, 7 frontend pages
- **PostgreSQL persistence** — Single `users` table with JSONB `data` column; no file-based storage
- **Hashed secrets** — Secrets are hashed with bcrypt (cost factor 10) before storage; plaintext never persisted
- **Conflict-resolved sync** — Timestamp-based conflict resolution prevents older data overwriting newer data
- **Rate-limited** — Sensitive endpoints protected by rate limiting (5 req/min/IP)

### Data Flow

```
SaintlyAnime Desktop  ←→  SaintlyCloud API  ←→  SaintlyCloud Dashboard
       │                        │
       │                        ▼
        │                 PostgreSQL Database
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

### Single Table Design

SaintlyCloud uses a **single `users` table** with a JSONB `data` column. This eliminates JOINs, simplifies persistence, and ensures atomic updates per user.

### Table: `users`

| Column     | Type          | Description                                                 |
|------------|---------------|-------------------------------------------------------------|
| id         | SERIAL PK     | Auto-incrementing internal ID                               |
| cloud_id   | TEXT UNIQUE   | Formatted ID (e.g., `SA-CLD-A1B2C3D4`), public identifier  |
| secret     | TEXT          | bcrypt-hashed secret (cost factor 10, never plaintext)       |
| data       | JSONB         | All user data: bookmarks, history, profile, devices, etc.   |
| created_at | TIMESTAMPTZ   | Auto-set on creation (NOW())                                |

### JSONB `data` Structure

```json
{
  "bookmarks": [
    {
      "animeId": "1434",
      "animeTitle": "Attack on Titan",
      "animeCover": "https://...",
      "status": "Watching",
      "currentEpisode": 12,
      "lastWatched": 1700000000000,
      "progress": 60
    }
  ],
  "history": [
    {
      "animeId": "1434",
      "animeTitle": "Attack on Titan",
      "animeCover": "https://...",
      "episode": 12,
      "timestamp": 1700000000000
    }
  ],
  "profile": {
    "username": "Saintly Viewer",
    "avatar": "",
    "banner": "",
    "frame": "",
    "accent": "#8a5fff"
  },
  "updatedAt": "2026-05-13T12:00:00.000Z",
  "devices": [
    {
      "deviceId": "uuid",
      "name": "My PC",
      "lastActive": "2026-05-13T12:00:00.000Z"
    }
  ],
  "recoveryCode": "a1b2c3-d4e5f6-g7h8i9",
  "oauthToken": {
    "accessToken": "...",
    "username": "anilist_user"
  }
}
```

### Indexes

- `idx_users_cloud_id` on `cloud_id` — fast lookup by cloud identifier

### Benefits of Single Table Design

| Concern | SQLite (old) | PostgreSQL (new) |
|---------|-------------|-------------------|
| Tables | 5 (users, devices, user_data, recovery_codes, oauth_tokens) | 1 (users) |
| Lookups | JOINs across 5 tables | Single-row SELECT by cloud_id |
| Writes | 3+ separate INSERTs per account creation | 1 INSERT per account |
| Data loss | Ephemeral filesystem lost entire DB | Persistent PostgreSQL volume |
| Atomicity | Requires transactions across statements | Single UPDATE on one row |

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

- `cloudId` is auto-generated and guaranteed unique (uses `randomBytes`)
- `secret` is **never stored in plaintext** — hashed with **bcrypt** (cost factor 10) using the `bcrypt` npm package
- Secret verification uses `bcrypt.compare()` — constant-time comparison built into bcrypt
- `recoveryCode` is generated at account creation and stored in the JSONB `data` field
- There is no password reset flow without the recovery code
- Regenerating credentials invalidates the old secret immediately

### Credential Validation Logic

All credential validation follows this consistent flow:

1. **Normalization** — Input is normalized before any hashing or verification:
   - `cloudId`: trimmed and uppercased via `normalizeCloudId()` (`(input || '').trim().toUpperCase()`)
   - `secret`: trimmed via `normalizeSecret()` (`(input || '').trim()`)
   - Normalization happens both in route handlers and in `db.ts` utility functions for defense-in-depth

2. **Hashing** (on create/recover/regenerate):
   - `hashSecret(secret)` calls `bcrypt.hash(normalizedSecret, 10)` — generates a salt and hash in one operation
   - bcrypt cost factor 10 provides strong protection against brute-force attacks
   - Stored as a single bcrypt hash string (includes embedded salt)

3. **Verification** (on validate/link-device/sync/devices/oauth):
   - `verifySecret(secret, hash)` calls `bcrypt.compare(normalizedSecret, storedHash)`
   - bcrypt's built-in constant-time comparison prevents timing attacks
   - Salt is automatically extracted from the stored hash by bcrypt

4. **Double normalization** — Both route handlers and DB functions normalize independently, ensuring consistency even if one layer changes

5. **What NOT to do:**
   - ❌ Never compare raw secret to hashed string
   - ❌ Never re-hash and compare hashes (must use bcrypt.compare)
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
4. Stores the token via `POST /api/oauth/store` or `POST /api/oauth/complete`
5. **Triggers automatic import** via `POST /api/oauth/sync` — fetches the user's full anime list, transforms it into bookmarks, and stores it in the cloud database
6. Redirects to the dashboard

**AniList Redirect URI Configuration:**
```
https://your-frontend-domain.com/
```
Note: Use the frontend URL (not the API URL) as the AniList redirect URI. The token is extracted client-side from the URL hash.

### `POST /api/oauth/sync`
Import the user's AniList anime list into SaintlyCloud bookmarks. Requires a connected AniList account (token stored via `/oauth/store` or `/oauth/complete`).

**Request:**
```json
{ "cloudId": "SA-CLD-XXXXXXXX", "secret": "mypassword" }
```

**Response:**
```json
{ "success": true, "synced": true, "count": 42 }
```

**Errors:** `401` invalid credentials, `404` no AniList token found, `502` AniList API failure

### Sync Flow Details

When `POST /api/oauth/sync` is called:

1. **Authentication** — Validates cloudId + secret credentials
2. **Token retrieval** — Fetches the stored AniList OAuth access token from the database
3. **GraphQL query** — Calls `https://graphql.anilist.co` with `Authorization: Bearer <token>` header:
   ```graphql
   query {
     MediaListCollection(type: ANIME) {
       lists {
         entries {
           media {
             id
             title { romaji english }
             coverImage { large }
             episodes
           }
           status
           progress
         }
       }
     }
   }
   ```
4. **Transformation** — Each AniList entry is converted to the cloud bookmark format:
   | Field | Source | Example |
   |-------|--------|---------|
   | `animeId` | `media.id` (as string) | `"1434"` |
   | `animeTitle` | `title.english` or `title.romaji` | `"Attack on Titan"` |
   | `animeCover` | `coverImage.large` | URL string |
   | `status` | Mapped from AniList status | `"CURRENT"` → `"Watching"` |
   | `currentEpisode` | `progress` | `12` |
   | `progress` | `(progress / episodes) * 100` | `60` |
5. **Status mapping:**
   | AniList Status | Local Status |
   |---------------|--------------|
   | `CURRENT` | `Watching` |
   | `COMPLETED` | `Completed` |
   | `PLANNING` | `Planned` |
   | `DROPPED` | `Dropped` |
   | `PAUSED` | `On Hold` |
   | `REPEATING` | `Watching` |
6. **Storage** — Transformed bookmarks are pushed to the cloud database via `pushData()`, replacing only the bookmark data while preserving existing history and profile
7. **Response** — Returns `{ success: true, synced: true, count: <number> }`

### Manual Sync

Users can trigger AniList sync manually at any time via the **"Sync AniList"** button on the **Sync Settings** page. This calls the same `POST /api/oauth/sync` endpoint.

### Error Handling

- **No token stored:** Returns `404` with message "No AniList token found. Connect AniList first."
- **AniList API failure:** Returns `502` with the AniList error body
- **Failed sync:** Existing bookmarks are never overwritten — the sync only writes on successful completion
- **On OAuth callback:** If sync fails, the user is notified but can still proceed to the dashboard; retry via Sync Settings

---

## PRODUCTION DEPLOYMENT

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3721` | Backend server port |
| `NODE_ENV` | `development` | Set to `production` to disable verbose logging |
| `DATABASE_URL` | **(required)** | PostgreSQL connection string (e.g., `postgresql://user:pass@host:5432/db`) |
| `CORS_ORIGIN` | `http://localhost:5174,http://localhost:4173,http://localhost:3721` | Comma-separated allowed CORS origins |
| `VITE_API_URL` | `/api` | Frontend API base URL (set to backend URL in production) |

### Hosting Backend (Render / Railway / Fly.io)

The backend is a standard Node.js + Express application with PostgreSQL.

**Prerequisites:**
- A PostgreSQL database instance (Render provides this via Render PostgreSQL, Railway via Railway PostgreSQL)
- `DATABASE_URL` environment variable pointing to your PostgreSQL connection string

**Build Command:** `npm run build`
**Start Command:** `npm start`
**Node Version:** `>=18`

**Deployment Steps:**
1. Set `NODE_ENV=production` in environment
2. Set `PORT` to the platform's assigned port (Render/Railway provide this automatically)
3. Set `DATABASE_URL` to your PostgreSQL connection string
4. Set `CORS_ORIGIN` to your frontend domain(s), comma-separated
5. Enable **Persistent Disk** on Render (or volume on Railway) to ensure the database is always accessible

**Render-specific:**
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- **Database**: Create a Render PostgreSQL instance, copy its `Internal Database URL` into the `DATABASE_URL` env var
- **Persistent Disk**: Attach a persistent disk to the service for data durability across deploys
- The schema is auto-created on first startup (`CREATE TABLE IF NOT EXISTS`)

**Railway-specific:**
- Build: `npm run build`
- Start: `npm start`
- **Database**: Provision a Railway PostgreSQL plugin, its connection string is auto-injected into `DATABASE_URL`
- Schema is auto-created on first startup

**Important Note on Data Persistence:**
Unlike SQLite (which was file-based and lost on ephemeral filesystems), **PostgreSQL is a separate service** — the database and the app run independently. Even if the app restarts or is redeployed, the database retains all data. This is the primary reason for migrating from SQLite.

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
│  https://.../api    │     │  PostgreSQL Database │
└─────────────────────┘     └─────────────────────┘
        │                           │
        │                           ▼
        │                    Render Persistent
        │                    Disk (recommended)
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

## STABILITY FIXES

### Database Path (Persistence)

**Problem:** After deploying updates, existing accounts stopped working because the SQLite database file was lost.

**Solution:**
- `DATABASE_PATH` is now resolved to an **absolute path** using `path.resolve()` in `db.ts`:
  ```typescript
  const DB_PATH = resolve(process.env.DATABASE_PATH || process.env.DB_PATH || './saintlycloud.db');
  ```
- On startup, the server logs the resolved path and whether the file exists:
  ```
  [DB] Database path: /app/saintlycloud.db
  [DB] Database file exists: true
  ```
- The **health endpoint** (`GET /api/health`) now returns the `database` field showing the active database path
- `initSchema()` uses `CREATE TABLE IF NOT EXISTS` exclusively — no `DROP TABLE`, no `DELETE FROM`, no schema recreation. Schema creation is a no-op if tables already exist.
- For production deployments, set `DATABASE_PATH` to a **persistent volume path** (Render persistent disk, Railway volume, etc.)
- On ephemeral filesystems, data can be restored from any connected client via push — credentials must be re-entered if the DB is lost

### Credential Persistence

**Problem:** Account creation worked but login immediately returned 401.

**Verification:**
- Secret normalization is applied **consistently** on both create and validate paths:
  - `normalizeSecret(secret)` trims whitespace
  - Applied in both `hashSecret()` (during create) and `verifySecret()` (during validate)
- Secret storage uses **scrypt + random salt** (`salt:hash` format) — never plaintext
- Verification uses **timingSafeEqual** — constant-time comparison, prevents timing attacks
- `validateCredentials()` now logs validation results to the console:
  ```
  [Auth] User found: SA-CLD-A1B2C3D4
  [Auth] Validation PASS for SA-CLD-A1B2C3D4
  ```

### Sync Merge Logic (Push)

**Problem:** Bookmarks and history were **fully replaced** on each push — if device A and device B both pushed, one device's data would completely overwrite the other's based on `updatedAt` timestamp alone.

**Solution — Per-item merge in `pushData()`:**

- **Bookmarks** are merged by `animeId`. For each incoming bookmark:
  - If it doesn't exist locally → added
  - If it exists and incoming `lastWatched` >= existing `lastWatched` → updated
  - Otherwise → existing kept
  - See `mergeBookmarks()` in `db.ts`

- **History** (continue watching) is merged by `(animeId, episode)` composite key. For each incoming history entry:
  - If it doesn't exist locally → added
  - If it exists and incoming `timestamp` >= existing `timestamp` → updated
  - Otherwise → existing kept
  - See `mergeHistory()` in `db.ts`

- **Profile** is still fully replaced (single object, no merge needed)
- The global `updatedAt` timestamp check still prevents **older pushes** from overwriting **newer merged data**

### Continue Watching Sync

**Problem:** Watch progress was not shared between devices.

**Solution:**
- The `history` array in `user_data` IS the continue watching system
- Each history entry stores: `{ animeId, animeTitle, animeCover, episode, timestamp }`
- Push sends the full `history` array → server merges by `(animeId, episode)` using timestamp comparison
- Pull returns the merged `history` array → client displays "Continue Watching" section
- Server logs confirm data arrives and is stored:
  ```
  [Sync/Push] history: 12 items
  [Push] Data updated for SA-CLD-A1B2C3D4
  ```

### Device Linking

**Problem:** `/link-device` could potentially overwrite user data.

**Verification:**
- `linkDevice()` only operates on the `devices` table — **never touches** `users`, `user_data`, or `recovery_codes`
- Uses `INSERT ... ON CONFLICT(deviceId) DO UPDATE SET lastActive = datetime('now'), name = COALESCE(?, name)`
- Only updates the device's `lastActive` timestamp and optionally the device name
- `updateDeviceActivity()` similarly only updates `lastActive` on devices

### Auth Consistency

All endpoints now use a **consistent authentication pattern**:

| HTTP Method | Auth Mechanism | Endpoints |
|------------|---------------|-----------|
| **POST** | Body: `{ cloudId, secret }` | `/validate`, `/link-device`, `/sync/push`, `/devices/remove`, `/devices/rename`, `/oauth/store`, `/oauth/init`, `/oauth/sync`, `/regenerate` |
| **GET** | Query: `cloudId` + Header: `x-secret` | `/sync/pull`, `/devices`, `/account/:cloudId`, `/recovery-code/:cloudId`, `/oauth/token` |

All auth paths normalize the same way:
1. `cloudId` is trimmed and uppercased
2. `secret` is trimmed
3. Validation goes through `validateCredentials()` → `normalizeCloudId()` + `normalizeSecret()` + `verifySecret()`

### Debug Logging

Console logs added for all critical operations (secrets are NEVER logged):

| Prefix | When |
|--------|------|
| `[DB]` | Database path, file existence, schema readiness |
| `[User]` | Account creation |
| `[Auth]` | Validation attempts (PASS/FAIL), user lookup |
| `[Auth/Create]` | Create-account requests |
| `[Auth/Validate]` | Validate-credential requests |
| `[Auth/LinkDevice]` | Device linking operations |
| `[Sync/Push]` | Push requests with item counts |
| `[Sync/Pull]` | Pull requests with data summary |
| `[Push]` | updatedAt comparison, merge results |

---

## SETUP & RUNNING

### Backend

```bash
cd saintlycloud/backend
npm install
npm run build
DATABASE_URL=postgresql://user:pass@localhost:5432/saintlycloud npm start
# Server starts on http://localhost:3721
```

> **Note:** For local development, you need a running PostgreSQL instance. You can use Docker:
> ```bash
> docker run -d --name saintlycloud-pg -e POSTGRES_PASSWORD=localdev -e POSTGRES_DB=saintlycloud -p 5432:5432 postgres:16
> ```
> Then set `DATABASE_URL=postgresql://postgres:localdev@localhost:5432/saintlycloud`

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
DATABASE_URL=postgresql://... NODE_ENV=production npm start

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
| `DATABASE_URL` | **(required)** | PostgreSQL connection string |
| `CORS_ORIGIN` | `http://localhost:5174,http://localhost:4173,http://localhost:3721` | Comma-separated allowed CORS origins |

---

## POSTGRESQL MIGRATION

### Why PostgreSQL?

The migration from SQLite to PostgreSQL was driven by a single critical requirement: **data persistence across deployments**.

| Concern | SQLite | PostgreSQL |
|---------|--------|------------|
| **Storage** | File-based (`./saintlycloud.db`) | Server-based (separate process) |
| **Persistence** | Lost on ephemeral filesystems | Survives app restarts/deploys |
| **Concurrent access** | Single-writer (file lock) | Multi-writer (connection pool) |
| **Deployment** | Requires persistent volume config | Just a connection string |
| **Backup** | Manual file copy | Built-in (pg_dump, replication) |

### Migration Changes

#### 1. Dependency Swap
- **Removed:** `better-sqlite3`, `@types/better-sqlite3`
- **Added:** `pg`, `@types/pg`, `bcrypt`, `@types/bcrypt`

#### 2. Schema Consolidation (5 tables → 1 table)

SQLite schema (old):
```
users, devices, user_data, recovery_codes, oauth_tokens
```

PostgreSQL schema (new):
```
users (id, cloud_id, secret, data JSONB, created_at)
```

All user-associated data is stored in the JSONB `data` column, eliminating JOINs and ensuring atomic writes.

#### 3. Credential Hashing

- **Old:** `crypto.scryptSync()` with custom salt extraction and `timingSafeEqual`
- **New:** `bcrypt.hash()` (cost factor 10) with built-in salt + constant-time comparison

bcrypt was chosen because:
- Industry standard for password hashing
- Built-in salt generation and storage
- Automatic constant-time comparison via `bcrypt.compare()`
- Well-audited and widely deployed

#### 4. Async Database Access

- **Old:** Synchronous (better-sqlite3)
- **New:** Async (pg with connection pool)

All route handlers are now `async`. Queries use parameterized placeholders (`$1`, `$2`) to prevent SQL injection.

#### 5. Connection Management

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
```

- **SSL enabled** (required by most cloud PostgreSQL providers)
- **Connection pool** of 10 connections for concurrent request handling
- **30s idle timeout** for efficient resource usage
- **10s connection timeout** for fast failure detection

#### 6. Schema Auto-Creation

On first startup, `initSchema()` creates the `users` table if it doesn't exist:

```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  cloud_id TEXT UNIQUE NOT NULL,
  secret TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The `CREATE TABLE IF NOT EXISTS` ensures the schema is created on fresh databases but is a no-op on existing ones.

### Rollback Plan

If PostgreSQL is unavailable or the migration needs to be reverted:

1. Revert `db.ts` to the SQLite version
2. Run `npm install better-sqlite3 @types/better-sqlite3`
3. Remove `pg` and `bcrypt`
4. Restore the old `routes/` and `index.ts` files
5. Set `DATABASE_PATH` to the old SQLite file path
6. The old API is wire-compatible — no frontend changes needed
