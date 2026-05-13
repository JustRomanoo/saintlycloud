import { Router } from 'express';
import { validateCredentials, storeOAuthToken, getOAuthToken, cloudIdPattern, createOAuthInitToken, consumeOAuthInitToken } from '../db.js';

export const oauthRouter = Router();

function ok(res: any, data: Record<string, any>) {
  return res.json({ success: true, ...data });
}

function fail(res: any, status: number, error: string, details?: string) {
  return res.status(status).json({ success: false, error, details });
}

oauthRouter.post('/oauth/store', (req, res) => {
  try {
    const { cloudId, secret, accessToken, username } = req.body;
    const normalizedCloudId = typeof cloudId === 'string' ? cloudId.trim().toUpperCase() : cloudId;
    const normalizedSecret = typeof secret === 'string' ? secret.trim() : secret;

    if (!normalizedCloudId || typeof normalizedCloudId !== 'string' || !cloudIdPattern().test(normalizedCloudId)) {
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
    if (!validateCredentials(normalizedCloudId, normalizedSecret)) {
      return fail(res, 401, 'Invalid credentials');
    }

    storeOAuthToken(normalizedCloudId, accessToken, username);
    return ok(res, { stored: true });
  } catch (err: any) {
    return fail(res, 500, 'Failed to store OAuth token', err.message);
  }
});

oauthRouter.get('/oauth/token', (req, res) => {
  try {
    const cloudIdRaw = req.query.cloudId as string;
    const secretRaw = req.headers['x-secret'] as string;
    const cloudId = typeof cloudIdRaw === 'string' ? cloudIdRaw.trim().toUpperCase() : cloudIdRaw;
    const secret = typeof secretRaw === 'string' ? secretRaw.trim() : secretRaw;

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
    if (!token) return fail(res, 404, 'No OAuth token stored');
    return ok(res, token);
  } catch (err: any) {
    return fail(res, 500, 'Failed to retrieve OAuth token', err.message);
  }
});

oauthRouter.post('/oauth/init', (req, res) => {
  try {
    const { cloudId, secret } = req.body;
    const normalizedCloudId = typeof cloudId === 'string' ? cloudId.trim().toUpperCase() : cloudId;
    const normalizedSecret = typeof secret === 'string' ? secret.trim() : secret;

    if (!normalizedCloudId || typeof normalizedCloudId !== 'string' || !cloudIdPattern().test(normalizedCloudId)) {
      return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
    }
    if (!normalizedSecret || typeof normalizedSecret !== 'string') {
      return fail(res, 400, 'secret is required');
    }
    if (!validateCredentials(normalizedCloudId, normalizedSecret)) {
      return fail(res, 401, 'Invalid credentials');
    }

    const initToken = createOAuthInitToken(normalizedCloudId);
    return ok(res, { initToken });
  } catch (err: any) {
    return fail(res, 500, 'Failed to create OAuth init token', err.message);
  }
});

oauthRouter.post('/oauth/complete', (req, res) => {
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

    const cloudId = consumeOAuthInitToken(initToken);
    if (!cloudId) {
      return fail(res, 401, 'Invalid or expired init token. Please start the OAuth process again from the desktop app.');
    }

    storeOAuthToken(cloudId, accessToken, username);
    return ok(res, { stored: true, cloudId });
  } catch (err: any) {
    return fail(res, 500, 'Failed to complete OAuth', err.message);
  }
});
