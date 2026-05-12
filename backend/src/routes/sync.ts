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

    if (!cloudId || typeof cloudId !== 'string' || !cloudIdPattern().test(cloudId)) {
      return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
    }
    if (!secret || typeof secret !== 'string') {
      return fail(res, 400, 'secret is required');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return fail(res, 400, 'data must be a JSON object with optional bookmarks, history, profile fields');
    }
    if (!validateCredentials(cloudId, secret)) {
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
    }
    if (data.history !== undefined) {
      if (!Array.isArray(data.history)) {
        return fail(res, 400, 'data.history must be an array');
      }
    }
    if (data.profile !== undefined) {
      if (typeof data.profile !== 'object' || Array.isArray(data.profile)) {
        return fail(res, 400, 'data.profile must be a JSON object');
      }
    }

    const success = pushData(cloudId, data);
    if (!success) {
      return fail(res, 404, 'Account not found');
    }

    const deviceId = req.headers['x-device-id'] as string;
    updateDeviceActivity(cloudId, deviceId);
    return ok(res, {});
  } catch (err: any) {
    return fail(res, 500, 'Sync push failed', err.message);
  }
});

syncRouter.get('/sync/pull', (req, res) => {
  try {
    const cloudId = req.query.cloudId as string;
    const secret = req.headers['x-secret'] as string;

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
    return fail(res, 500, 'Sync pull failed', err.message);
  }
});
