"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const db_js_1 = require("../db.js");
exports.authRouter = (0, express_1.Router)();
function ok(res, data) {
    return res.json({ success: true, ...data });
}
function fail(res, status, error, details) {
    return res.status(status).json({ success: false, error, details });
}
exports.authRouter.post('/create-account', (req, res) => {
    try {
        const { deviceId, secret, deviceName } = req.body;
        if (!deviceId || typeof deviceId !== 'string') {
            return fail(res, 400, 'deviceId is required and must be a string');
        }
        if (!secret || typeof secret !== 'string') {
            return fail(res, 400, 'secret is required and must be a string');
        }
        if (secret.length < 8) {
            return fail(res, 400, 'Secret must be at least 8 characters');
        }
        if (secret.length > 256) {
            return fail(res, 400, 'Secret must be at most 256 characters');
        }
        const { cloudId, recoveryCode } = (0, db_js_1.createUser)(secret);
        (0, db_js_1.linkDevice)(cloudId, deviceId, typeof deviceName === 'string' ? deviceName.slice(0, 100) : undefined);
        return ok(res, { cloudId, recoveryCode });
    }
    catch (err) {
        return fail(res, 500, 'Failed to create account', err.message);
    }
});
exports.authRouter.post('/link-device', (req, res) => {
    try {
        const { cloudId, secret, deviceId, deviceName } = req.body;
        if (!cloudId || typeof cloudId !== 'string' || !(0, db_js_1.cloudIdPattern)().test(cloudId)) {
            return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
        }
        if (!secret || typeof secret !== 'string') {
            return fail(res, 400, 'secret is required');
        }
        if (!deviceId || typeof deviceId !== 'string') {
            return fail(res, 400, 'deviceId is required and must be a string');
        }
        if (!(0, db_js_1.validateCredentials)(cloudId, secret)) {
            return fail(res, 401, 'Invalid credentials');
        }
        (0, db_js_1.linkDevice)(cloudId, deviceId, typeof deviceName === 'string' ? deviceName.slice(0, 100) : undefined);
        return ok(res, { cloudId });
    }
    catch (err) {
        return fail(res, 500, 'Failed to link device', err.message);
    }
});
exports.authRouter.post('/validate', (req, res) => {
    try {
        const { cloudId, secret } = req.body;
        if (!cloudId || typeof cloudId !== 'string') {
            return fail(res, 400, 'cloudId is required');
        }
        if (!secret || typeof secret !== 'string') {
            return fail(res, 400, 'secret is required');
        }
        const valid = (0, db_js_1.validateCredentials)(cloudId, secret);
        if (!valid) {
            return fail(res, 401, 'Invalid credentials');
        }
        const info = (0, db_js_1.getAccountInfo)(cloudId);
        return ok(res, { cloudId: info?.cloudId, createdAt: info?.createdAt });
    }
    catch (err) {
        return fail(res, 500, 'Validation failed', err.message);
    }
});
exports.authRouter.post('/recover', (req, res) => {
    try {
        const { recoveryCode, newSecret } = req.body;
        if (!recoveryCode || typeof recoveryCode !== 'string') {
            return fail(res, 400, 'recoveryCode is required');
        }
        if (!newSecret || typeof newSecret !== 'string') {
            return fail(res, 400, 'newSecret is required');
        }
        if (newSecret.length < 8) {
            return fail(res, 400, 'New secret must be at least 8 characters');
        }
        if (newSecret.length > 256) {
            return fail(res, 400, 'New secret must be at most 256 characters');
        }
        const result = (0, db_js_1.recoverAccount)(recoveryCode.trim(), newSecret);
        if (!result) {
            return fail(res, 404, 'Invalid recovery code');
        }
        return ok(res, { cloudId: result.cloudId });
    }
    catch (err) {
        return fail(res, 500, 'Recovery failed', err.message);
    }
});
exports.authRouter.post('/regenerate', (req, res) => {
    try {
        const { cloudId, oldSecret, newSecret } = req.body;
        if (!cloudId || typeof cloudId !== 'string') {
            return fail(res, 400, 'cloudId is required');
        }
        if (!oldSecret || typeof oldSecret !== 'string') {
            return fail(res, 400, 'oldSecret is required');
        }
        if (!newSecret || typeof newSecret !== 'string') {
            return fail(res, 400, 'newSecret is required');
        }
        if (newSecret.length < 8) {
            return fail(res, 400, 'New secret must be at least 8 characters');
        }
        if (newSecret.length > 256) {
            return fail(res, 400, 'New secret must be at most 256 characters');
        }
        const success = (0, db_js_1.regenerateCredentials)(cloudId, oldSecret, newSecret);
        if (!success) {
            return fail(res, 401, 'Invalid credentials');
        }
        return ok(res, {});
    }
    catch (err) {
        return fail(res, 500, 'Regeneration failed', err.message);
    }
});
exports.authRouter.get('/account/:cloudId', (req, res) => {
    try {
        const { cloudId } = req.params;
        const secret = req.headers['x-secret'];
        if (!cloudId || !(0, db_js_1.cloudIdPattern)().test(cloudId)) {
            return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
        }
        if (!secret || typeof secret !== 'string') {
            return fail(res, 400, 'x-secret header is required');
        }
        if (!(0, db_js_1.validateCredentials)(cloudId, secret)) {
            return fail(res, 401, 'Invalid credentials');
        }
        const info = (0, db_js_1.getAccountInfo)(cloudId);
        if (!info)
            return fail(res, 404, 'Account not found');
        return ok(res, { cloudId: info.cloudId, createdAt: info.createdAt });
    }
    catch (err) {
        return fail(res, 500, 'Failed to get account info', err.message);
    }
});
exports.authRouter.get('/recovery-code/:cloudId', (req, res) => {
    try {
        const { cloudId } = req.params;
        const secret = req.headers['x-secret'];
        if (!cloudId || !(0, db_js_1.cloudIdPattern)().test(cloudId)) {
            return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
        }
        if (!secret || typeof secret !== 'string') {
            return fail(res, 400, 'x-secret header is required');
        }
        if (!(0, db_js_1.validateCredentials)(cloudId, secret)) {
            return fail(res, 401, 'Invalid credentials');
        }
        const code = (0, db_js_1.getRecoveryCodeByCloudId)(cloudId);
        if (!code)
            return fail(res, 404, 'Recovery code not found');
        return ok(res, { code });
    }
    catch (err) {
        return fail(res, 500, 'Failed to get recovery code', err.message);
    }
});
