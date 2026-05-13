"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.oauthRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
exports.oauthRouter = (0, express_1.Router)();
function ok(res, data) {
    return res.json({ success: true, ...data });
}
function fail(res, status, error, details) {
    return res.status(status).json({ success: false, error, details });
}
exports.oauthRouter.post('/oauth/store', (req, res) => {
    try {
        const { cloudId, secret, accessToken, username } = req.body;
        const normalizedCloudId = typeof cloudId === 'string' ? cloudId.trim().toUpperCase() : cloudId;
        const normalizedSecret = typeof secret === 'string' ? secret.trim() : secret;
        if (!normalizedCloudId || typeof normalizedCloudId !== 'string' || !(0, db_js_1.cloudIdPattern)().test(normalizedCloudId)) {
            return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
        }
        if (!normalizedSecret || typeof normalizedSecret !== 'string') {
            return fail(res, 400, 'secret is required');
        }
        if (!accessToken || typeof accessToken !== 'string') {
            return fail(res, 400, 'accessToken is required');
        }
        if (!username || typeof username !== 'string') {
            return fail(res, 400, 'username is required');
        }
        if (!(0, db_js_1.validateCredentials)(normalizedCloudId, normalizedSecret)) {
            return fail(res, 401, 'Invalid credentials');
        }
        (0, db_js_1.storeOAuthToken)(normalizedCloudId, accessToken, username);
        return ok(res, { stored: true });
    }
    catch (err) {
        return fail(res, 500, 'Failed to store OAuth token', err.message);
    }
});
exports.oauthRouter.get('/oauth/token', (req, res) => {
    try {
        const cloudIdRaw = req.query.cloudId;
        const secretRaw = req.headers['x-secret'];
        const cloudId = typeof cloudIdRaw === 'string' ? cloudIdRaw.trim().toUpperCase() : cloudIdRaw;
        const secret = typeof secretRaw === 'string' ? secretRaw.trim() : secretRaw;
        if (!cloudId || typeof cloudId !== 'string' || !(0, db_js_1.cloudIdPattern)().test(cloudId)) {
            return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
        }
        if (!secret || typeof secret !== 'string') {
            return fail(res, 400, 'x-secret header is required');
        }
        if (!(0, db_js_1.validateCredentials)(cloudId, secret)) {
            return fail(res, 401, 'Invalid credentials');
        }
        const token = (0, db_js_1.getOAuthToken)(cloudId);
        if (!token)
            return fail(res, 404, 'No OAuth token stored');
        return ok(res, token);
    }
    catch (err) {
        return fail(res, 500, 'Failed to retrieve OAuth token', err.message);
    }
});
exports.oauthRouter.post('/oauth/init', (req, res) => {
    try {
        const { cloudId, secret } = req.body;
        const normalizedCloudId = typeof cloudId === 'string' ? cloudId.trim().toUpperCase() : cloudId;
        const normalizedSecret = typeof secret === 'string' ? secret.trim() : secret;
        if (!normalizedCloudId || typeof normalizedCloudId !== 'string' || !(0, db_js_1.cloudIdPattern)().test(normalizedCloudId)) {
            return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
        }
        if (!normalizedSecret || typeof normalizedSecret !== 'string') {
            return fail(res, 400, 'secret is required');
        }
        if (!(0, db_js_1.validateCredentials)(normalizedCloudId, normalizedSecret)) {
            return fail(res, 401, 'Invalid credentials');
        }
        const initToken = (0, db_js_1.createOAuthInitToken)(normalizedCloudId);
        return ok(res, { initToken });
    }
    catch (err) {
        return fail(res, 500, 'Failed to create OAuth init token', err.message);
    }
});
exports.oauthRouter.post('/oauth/complete', (req, res) => {
    try {
        const { initToken, accessToken, username } = req.body;
        if (!initToken || typeof initToken !== 'string') {
            return fail(res, 400, 'initToken is required');
        }
        if (!accessToken || typeof accessToken !== 'string') {
            return fail(res, 400, 'accessToken is required');
        }
        if (!username || typeof username !== 'string') {
            return fail(res, 400, 'username is required');
        }
        const cloudId = (0, db_js_1.consumeOAuthInitToken)(initToken);
        if (!cloudId) {
            return fail(res, 401, 'Invalid or expired init token. Please start the OAuth process again from the desktop app.');
        }
        (0, db_js_1.storeOAuthToken)(cloudId, accessToken, username);
        return ok(res, { stored: true, cloudId });
    }
    catch (err) {
        return fail(res, 500, 'Failed to complete OAuth', err.message);
    }
});
