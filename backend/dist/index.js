"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const db_js_1 = require("./db.js");
const auth_js_1 = require("./routes/auth.js");
const sync_js_1 = require("./routes/sync.js");
const devices_js_1 = require("./routes/devices.js");
const oauth_js_1 = require("./routes/oauth.js");
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '3721');
const IS_DEV = process.env.NODE_ENV !== 'production';
app.set('trust proxy', 1);
const defaultOrigins = IS_DEV
    ? 'http://localhost:5174,http://localhost:4173,http://localhost:3721,http://tauri.localhost,https://tauri.localhost,tauri://localhost,https://saintlycloud.vercel.app'
    : 'http://tauri.localhost,https://tauri.localhost,tauri://localhost,https://saintlycloud.vercel.app';
const allowedOrigins = (process.env.CORS_ORIGIN || defaultOrigins)
    .split(',').map(s => s.trim()).filter(Boolean);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || origin === 'null' || origin.startsWith('tauri://') || origin.startsWith('http://tauri.localhost') || origin.startsWith('https://tauri.localhost') || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            console.warn(`[CORS] Blocked origin: ${origin}`);
            callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
    }
}));
app.use(express_1.default.json({ limit: '10mb' }));
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests. Try again in a minute.' },
});
app.use('/api/create-account', authLimiter);
app.use('/api/recover', authLimiter);
app.use('/api/link-device', authLimiter);
const startTime = Date.now();
if (IS_DEV) {
    app.use((req, _res, next) => {
        const safe = { method: req.method, url: req.url, ip: req.ip };
        console.log(`[${new Date().toISOString()}] ${safe.method} ${safe.url} from ${safe.ip}`);
        next();
    });
}
// Async startup
(async () => {
    try {
        await (0, db_js_1.initSchema)();
        const status = await (0, db_js_1.getDbStatus)();
        console.log(`[DB] PostgreSQL connected — ${status.userCount} users in database`);
    }
    catch (err) {
        console.error(`[DB] Failed to initialize database: ${err.message}`);
        process.exit(1);
    }
})();
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'saintlycloud',
        timestamp: new Date().toISOString(),
    });
});
app.get('/api/health', async (_req, res) => {
    const status = await (0, db_js_1.getDbStatus)();
    res.json({
        success: true,
        status: status.connected ? 'ok' : 'degraded',
        service: 'saintlycloud',
        version: '1.2.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        environment: IS_DEV ? 'development' : 'production',
        database: 'postgresql',
        userCount: status.userCount,
        timestamp: new Date().toISOString(),
    });
});
app.use('/api', auth_js_1.authRouter);
app.use('/api', sync_js_1.syncRouter);
app.use('/api', devices_js_1.devicesRouter);
app.use('/api', oauth_js_1.oauthRouter);
app.use((err, _req, res, _next) => {
    console.error(`[ERROR] ${err.message || 'Unknown error'}`);
    res.status(500).json({ success: false, error: 'Internal server error' });
});
app.listen(PORT, () => {
    console.log(`SaintlyCloud v1.2.0 running on port ${PORT} [${IS_DEV ? 'development' : 'production'}]`);
});
