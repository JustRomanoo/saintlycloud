import { Router } from 'express';
import { validateCredentials, getDevices, removeDevice, renameDevice, cloudIdPattern } from '../db.js';

export const devicesRouter = Router();

function ok(res: any, data: Record<string, any>) {
  return res.json({ success: true, ...data });
}

function fail(res: any, status: number, error: string, details?: string) {
  return res.status(status).json({ success: false, error, details });
}

function assertAuth(req: any, res: any): string | null {
  const cloudId = req.body.cloudId || req.query.cloudId;
  const secret = req.body.secret || req.headers['x-secret'];
  if (!cloudId || typeof cloudId !== 'string' || !cloudIdPattern().test(cloudId)) {
    fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
    return null;
  }
  if (!secret || typeof secret !== 'string') {
    fail(res, 400, 'secret or x-secret header is required');
    return null;
  }
  if (!validateCredentials(cloudId, secret)) {
    fail(res, 401, 'Invalid credentials');
    return null;
  }
  return cloudId;
}

devicesRouter.get('/devices', (req, res) => {
  try {
    const cloudId = assertAuth(req, res);
    if (!cloudId) return;

    const devices = getDevices(cloudId);
    return ok(res, { devices });
  } catch (err: any) {
    return fail(res, 500, 'Failed to get devices', err.message);
  }
});

devicesRouter.post('/devices/remove', (req, res) => {
  try {
    const cloudId = assertAuth(req, res);
    if (!cloudId) return;

    const { deviceId } = req.body;
    if (!deviceId || typeof deviceId !== 'string') {
      return fail(res, 400, 'deviceId is required and must be a string');
    }

    const success = removeDevice(cloudId, deviceId);
    if (!success) return fail(res, 404, 'Device not found');
    return ok(res, {});
  } catch (err: any) {
    return fail(res, 500, 'Failed to remove device', err.message);
  }
});

devicesRouter.post('/devices/rename', (req, res) => {
  try {
    const cloudId = assertAuth(req, res);
    if (!cloudId) return;

    const { deviceId, name } = req.body;
    if (!deviceId || typeof deviceId !== 'string') {
      return fail(res, 400, 'deviceId is required and must be a string');
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return fail(res, 400, 'name is required and must be a non-empty string');
    }
    if (name.length > 100) {
      return fail(res, 400, 'name must be at most 100 characters');
    }

    const success = renameDevice(cloudId, deviceId, name.trim());
    if (!success) return fail(res, 404, 'Device not found');
    return ok(res, {});
  } catch (err: any) {
    return fail(res, 500, 'Failed to rename device', err.message);
  }
});
