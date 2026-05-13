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
exports.authRouter.post('/create-account', async (req, res) => {
    try {
        const { deviceId, secret, deviceName } = req.body;
        const normalizedDeviceId = typeof deviceId === 'string' ? deviceId.trim() : deviceId;
        const normalizedSecret = typeof secret === 'string' ? secret.trim() : secret;
        console.log(`[Auth/Create] Request from device: ${normalizedDeviceId}`);
        if (!normalizedDeviceId || typeof normalizedDeviceId !== 'string') {
            return fail(res, 400, 'deviceId is required and must be a string');
        }
        if (!normalizedSecret || typeof normalizedSecret !== 'string') {
            return fail(res, 400, 'secret is required and must be a string');
        }
        if (normalizedSecret.length < 8) {
            return fail(res, 400, 'Secret must be at least 8 characters');
        }
        if (normalizedSecret.length > 256) {
            return fail(res, 400, 'Secret must be at most 256 characters');
        }
        const { cloudId, recoveryCode } = await (0, db_js_1.createUser)(normalizedSecret);
        await (0, db_js_1.linkDevice)(cloudId, normalizedDeviceId, typeof deviceName === 'string' ? deviceName.trim().slice(0, 100) : undefined);
        console.log(`[Auth/Create] Success: ${cloudId}`);
        return ok(res, { cloudId, recoveryCode });
    }
    catch (err) {
        console.error(`[Auth/Create] Error: ${err.message}`);
        return fail(res, 500, 'Failed to create account', err.message);
    }
});
exports.authRouter.post('/link-device', async (req, res) => {
    try {
        const { cloudId, secret, deviceId, deviceName } = req.body;
        const normalizedCloudId = typeof cloudId === 'string' ? cloudId.trim().toUpperCase() : cloudId;
        const normalizedSecret = typeof secret === 'string' ? secret.trim() : secret;
        const normalizedDeviceId = typeof deviceId === 'string' ? deviceId.trim() : deviceId;
        console.log(`[Auth/LinkDevice] Linking ${normalizedDeviceId} to ${normalizedCloudId}`);
        if (!normalizedCloudId || typeof normalizedCloudId !== 'string' || !(0, db_js_1.cloudIdPattern)().test(normalizedCloudId)) {
            return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
        }
        if (!normalizedSecret || typeof normalizedSecret !== 'string') {
            return fail(res, 400, 'secret is required');
        }
        if (!normalizedDeviceId || typeof normalizedDeviceId !== 'string') {
            return fail(res, 400, 'deviceId is required and must be a string');
        }
        if (!(await (0, db_js_1.validateCredentials)(normalizedCloudId, normalizedSecret))) {
            return fail(res, 401, 'Invalid credentials');
        }
        await (0, db_js_1.linkDevice)(normalizedCloudId, normalizedDeviceId, typeof deviceName === 'string' ? deviceName.trim().slice(0, 100) : undefined);
        console.log(`[Auth/LinkDevice] Success: ${normalizedDeviceId} -> ${normalizedCloudId}`);
        return ok(res, { cloudId: normalizedCloudId });
    }
    catch (err) {
        console.error(`[Auth/LinkDevice] Error: ${err.message}`);
        return fail(res, 500, 'Failed to link device', err.message);
    }
});
exports.authRouter.post('/validate', async (req, res) => {
    try {
        const { cloudId, secret } = req.body;
        const normalizedCloudId = typeof cloudId === 'string' ? cloudId.trim().toUpperCase() : cloudId;
        const normalizedSecret = typeof secret === 'string' ? secret.trim() : secret;
        console.log(`[Auth/Validate] Request for ${normalizedCloudId}`);
        if (!normalizedCloudId || typeof normalizedCloudId !== 'string' || !(0, db_js_1.cloudIdPattern)().test(normalizedCloudId)) {
            return fail(res, 400, 'cloudId is required');
        }
        if (!normalizedSecret || typeof normalizedSecret !== 'string') {
            return fail(res, 400, 'secret is required');
        }
        const valid = await (0, db_js_1.validateCredentials)(normalizedCloudId, normalizedSecret);
        if (!valid) {
            console.log(`[Auth/Validate] FAILED for ${normalizedCloudId}`);
            return fail(res, 401, 'Invalid credentials');
        }
        const info = await (0, db_js_1.getAccountInfo)(normalizedCloudId);
        console.log(`[Auth/Validate] PASS for ${normalizedCloudId}`);
        return ok(res, { cloudId: info?.cloudId, createdAt: info?.createdAt });
    }
    catch (err) {
        console.error(`[Auth/Validate] Error: ${err.message}`);
        return fail(res, 500, 'Validation failed', err.message);
    }
});
exports.authRouter.post('/recover', async (req, res) => {
    try {
        const { recoveryCode, newSecret } = req.body;
        const normalizedRecovery = typeof recoveryCode === 'string' ? recoveryCode.trim() : recoveryCode;
        const normalizedNewSecret = typeof newSecret === 'string' ? newSecret.trim() : newSecret;
        if (!normalizedRecovery || typeof normalizedRecovery !== 'string') {
            return fail(res, 400, 'recoveryCode is required');
        }
        if (!normalizedNewSecret || typeof normalizedNewSecret !== 'string') {
            return fail(res, 400, 'newSecret is required');
        }
        if (normalizedNewSecret.length < 8) {
            return fail(res, 400, 'New secret must be at least 8 characters');
        }
        if (normalizedNewSecret.length > 256) {
            return fail(res, 400, 'New secret must be at most 256 characters');
        }
        const result = await (0, db_js_1.recoverAccount)(normalizedRecovery, normalizedNewSecret);
        if (!result) {
            return fail(res, 404, 'Invalid recovery code');
        }
        return ok(res, { cloudId: result.cloudId });
    }
    catch (err) {
        return fail(res, 500, 'Recovery failed', err.message);
    }
});
exports.authRouter.post('/regenerate', async (req, res) => {
    try {
        const { cloudId, oldSecret, newSecret } = req.body;
        const normalizedCloudId = typeof cloudId === 'string' ? cloudId.trim().toUpperCase() : cloudId;
        const normalizedOldSecret = typeof oldSecret === 'string' ? oldSecret.trim() : oldSecret;
        const normalizedNewSecret = typeof newSecret === 'string' ? newSecret.trim() : newSecret;
        if (!normalizedCloudId || typeof normalizedCloudId !== 'string' || !(0, db_js_1.cloudIdPattern)().test(normalizedCloudId)) {
            return fail(res, 400, 'cloudId is required');
        }
        if (!normalizedOldSecret || typeof normalizedOldSecret !== 'string') {
            return fail(res, 400, 'oldSecret is required');
        }
        if (!normalizedNewSecret || typeof normalizedNewSecret !== 'string') {
            return fail(res, 400, 'newSecret is required');
        }
        if (normalizedNewSecret.length < 8) {
            return fail(res, 400, 'New secret must be at least 8 characters');
        }
        if (normalizedNewSecret.length > 256) {
            return fail(res, 400, 'New secret must be at most 256 characters');
        }
        const success = await (0, db_js_1.regenerateCredentials)(normalizedCloudId, normalizedOldSecret, normalizedNewSecret);
        if (!success) {
            return fail(res, 401, 'Invalid credentials');
        }
        return ok(res, {});
    }
    catch (err) {
        return fail(res, 500, 'Regeneration failed', err.message);
    }
});
exports.authRouter.get('/account/:cloudId', async (req, res) => {
    try {
        const cloudIdRaw = req.params.cloudId;
        const secretRaw = req.headers['x-secret'];
        const cloudId = typeof cloudIdRaw === 'string' ? cloudIdRaw.trim().toUpperCase() : cloudIdRaw;
        const secret = typeof secretRaw === 'string' ? secretRaw.trim() : secretRaw;
        if (!cloudId || !(0, db_js_1.cloudIdPattern)().test(cloudId)) {
            return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
        }
        if (!secret || typeof secret !== 'string') {
            return fail(res, 400, 'x-secret header is required');
        }
        if (!(await (0, db_js_1.validateCredentials)(cloudId, secret))) {
            return fail(res, 401, 'Invalid credentials');
        }
        const info = await (0, db_js_1.getAccountInfo)(cloudId);
        if (!info)
            return fail(res, 404, 'Account not found');
        return ok(res, { cloudId: info.cloudId, createdAt: info.createdAt });
    }
    catch (err) {
        return fail(res, 500, 'Failed to get account info', err.message);
    }
});
exports.authRouter.get('/recovery-code/:cloudId', async (req, res) => {
    try {
        const cloudIdRaw = req.params.cloudId;
        const secretRaw = req.headers['x-secret'];
        const cloudId = typeof cloudIdRaw === 'string' ? cloudIdRaw.trim().toUpperCase() : cloudIdRaw;
        const secret = typeof secretRaw === 'string' ? secretRaw.trim() : secretRaw;
        if (!cloudId || !(0, db_js_1.cloudIdPattern)().test(cloudId)) {
            return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
        }
        if (!secret || typeof secret !== 'string') {
            return fail(res, 400, 'x-secret header is required');
        }
        if (!(await (0, db_js_1.validateCredentials)(cloudId, secret))) {
            return fail(res, 401, 'Invalid credentials');
        }
        const code = await (0, db_js_1.getRecoveryCodeByCloudId)(cloudId);
        if (!code)
            return fail(res, 404, 'Recovery code not found');
        return ok(res, { code });
    }
    catch (err) {
        return fail(res, 500, 'Failed to get recovery code', err.message);
    }
});
