import { Router } from 'express';
import { validateCredentials, pushData, pullData, updateDeviceActivity, cloudIdPattern } from '../db.js';

export const syncRouter = Router();

function ok(res: any, data: Record<string, any>) {
  return res.json({ success: true, ...data });
}

function fail(res: any, status: number, error: string, details?: string) {
  return res.status(status).json({ success: false, error, details });
}

syncRouter.post('/sync/push', (req, res) => {
  try {
    const { cloudId, secret, data } = req.body;
    const normalizedCloudId = typeof cloudId === 'string' ? cloudId.trim().toUpperCase() : cloudId;
    const normalizedSecret = typeof secret === 'string' ? secret.trim() : secret;

    console.log(`[Sync/Push] Request for ${normalizedCloudId}`);

    if (!normalizedCloudId || typeof normalizedCloudId !== 'string' || !cloudIdPattern().test(normalizedCloudId)) {
      return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
    }
    if (!normalizedSecret || typeof normalizedSecret !== 'string') {
      return fail(res, 400, 'secret is required');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return fail(res, 400, 'data must be a JSON object with optional bookmarks, history, profile fields');
    }
    if (!validateCredentials(normalizedCloudId, normalizedSecret)) {
      return fail(res, 401, 'Invalid credentials');
    }

    if (data.bookmarks !== undefined) {
      if (!Array.isArray(data.bookmarks)) {
        return fail(res, 400, 'data.bookmarks must be an array');
      }
      for (const bm of data.bookmarks) {
        if (!bm || typeof bm !== 'object') {
          return fail(res, 400, 'Each bookmark must be a JSON object');
        }
      }
      console.log(`[Sync/Push] bookmarks: ${data.bookmarks.length} items`);
    }
    if (data.history !== undefined) {
      if (!Array.isArray(data.history)) {
        return fail(res, 400, 'data.history must be an array');
      }
      console.log(`[Sync/Push] history: ${data.history.length} items`);
    }
    if (data.profile !== undefined) {
      if (typeof data.profile !== 'object' || Array.isArray(data.profile)) {
        return fail(res, 400, 'data.profile must be a JSON object');
      }
      console.log(`[Sync/Push] profile: included`);
    }

    const success = pushData(normalizedCloudId, data);
    if (!success) {
      return fail(res, 404, 'Account not found');
    }

    const deviceId = req.headers['x-device-id'] as string;
    updateDeviceActivity(normalizedCloudId, deviceId);
    console.log(`[Sync/Push] Completed for ${normalizedCloudId}`);
    return ok(res, {});
  } catch (err: any) {
    console.error(`[Sync/Push] Error: ${err.message}`);
    return fail(res, 500, 'Sync push failed', err.message);
  }
});

syncRouter.get('/sync/pull', (req, res) => {
  try {
    const cloudIdRaw = req.query.cloudId as string;
    const secretRaw = req.headers['x-secret'] as string;
    const cloudId = typeof cloudIdRaw === 'string' ? cloudIdRaw.trim().toUpperCase() : cloudIdRaw;
    const secret = typeof secretRaw === 'string' ? secretRaw.trim() : secretRaw;

    console.log(`[Sync/Pull] Request for ${cloudId}`);

    if (!cloudId || typeof cloudId !== 'string' || !cloudIdPattern().test(cloudId)) {
      return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
    }
    if (!secret || typeof secret !== 'string') {
      return fail(res, 400, 'x-secret header is required');
    }
    if (!validateCredentials(cloudId, secret)) {
      return fail(res, 401, 'Invalid credentials');
    }

    const data = pullData(cloudId);
    if (!data) {
      return fail(res, 404, 'No data found');
    }

    const deviceId = req.headers['x-device-id'] as string;
    updateDeviceActivity(cloudId, deviceId);

    return ok(res, {
      bookmarks: data.bookmarks,
      history: data.history,
      profile: data.profile,
      updatedAt: data.updatedAt,
    });
  } catch (err: any) {
    console.error(`[Sync/Pull] Error: ${err.message}`);
    return fail(res, 500, 'Sync pull failed', err.message);
  }
});
