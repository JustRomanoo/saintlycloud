import { Router } from 'express';
import { validateCredentials, storeOAuthToken, getOAuthToken, cloudIdPattern } from '../db.js';
export const oauthRouter = Router();
function ok(res, data) {
    return res.json({ success: true, ...data });
}
function fail(res, status, error, details) {
    return res.status(status).json({ success: false, error, details });
}
oauthRouter.post('/oauth/store', (req, res) => {
    try {
        const { cloudId, secret, accessToken, username } = req.body;
        if (!cloudId || typeof cloudId !== 'string' || !cloudIdPattern().test(cloudId)) {
            return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
        }
        if (!secret || typeof secret !== 'string') {
            return fail(res, 400, 'secret is required');
        }
        if (!accessToken || typeof accessToken !== 'string') {
            return fail(res, 400, 'accessToken is required');
        }
        if (!username || typeof username !== 'string') {
            return fail(res, 400, 'username is required');
        }
        if (!validateCredentials(cloudId, secret)) {
            return fail(res, 401, 'Invalid credentials');
        }
        storeOAuthToken(cloudId, accessToken, username);
        return ok(res, { stored: true });
    }
    catch (err) {
        return fail(res, 500, 'Failed to store OAuth token', err.message);
    }
});
oauthRouter.get('/oauth/token', (req, res) => {
    try {
        const cloudId = req.query.cloudId;
        const secret = req.headers['x-secret'];
        if (!cloudId || typeof cloudId !== 'string' || !cloudIdPattern().test(cloudId)) {
            return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
        }
        if (!secret || typeof secret !== 'string') {
            return fail(res, 400, 'x-secret header is required');
        }
        if (!validateCredentials(cloudId, secret)) {
            return fail(res, 401, 'Invalid credentials');
        }
        const token = getOAuthToken(cloudId);
        if (!token)
            return fail(res, 404, 'No OAuth token stored');
        return ok(res, token);
    }
    catch (err) {
        return fail(res, 500, 'Failed to retrieve OAuth token', err.message);
    }
});
