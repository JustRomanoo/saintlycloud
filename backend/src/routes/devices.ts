import { Router } from 'express';
import { validateCredentials, getDevices, removeDevice, renameDevice, cloudIdPattern } from '../db.js';

export const devicesRouter = Router();

function ok(res: any, data: Record<string, any>) {
  return res.json({ success: true, ...data });
}

function fail(res: any, status: number, error: string, details?: string) {
  return res.status(status).json({ success: false, error, details });
}

async function assertAuth(req: any, res: any): Promise<string | null> {
  const cloudIdRaw = (req.body.cloudId || req.query.cloudId) as any;
  const secretRaw = (req.body.secret || req.headers['x-secret']) as any;
  const cloudId = typeof cloudIdRaw === 'string' ? cloudIdRaw.trim().toUpperCase() : cloudIdRaw;
  const secret = typeof secretRaw === 'string' ? secretRaw.trim() : secretRaw;
  if (!cloudId || typeof cloudId !== 'string' || !cloudIdPattern().test(cloudId)) {
    fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
    return null;
  }
  if (!secret || typeof secret !== 'string') {
    fail(res, 400, 'secret or x-secret header is required');
    return null;
  }
  if (!(await validateCredentials(cloudId, secret))) {
    fail(res, 401, 'Invalid credentials');
    return null;
  }
  return cloudId;
}

devicesRouter.get('/devices', async (req, res) => {
  try {
    const cloudId = await assertAuth(req, res);
    if (!cloudId) return;

    const devices = await getDevices(cloudId);
    return ok(res, { devices });
  } catch (err: any) {
    return fail(res, 500, 'Failed to get devices', err.message);
  }
});

devicesRouter.post('/devices/remove', async (req, res) => {
  try {
    const cloudId = await assertAuth(req, res);
    if (!cloudId) return;

    const { deviceId } = req.body;
    if (!deviceId || typeof deviceId !== 'string') {
      return fail(res, 400, 'deviceId is required and must be a string');
    }

    const success = await removeDevice(cloudId, deviceId);
    if (!success) return fail(res, 404, 'Device not found');
    return ok(res, {});
  } catch (err: any) {
    return fail(res, 500, 'Failed to remove device', err.message);
  }
});

devicesRouter.post('/devices/rename', async (req, res) => {
  try {
    const cloudId = await assertAuth(req, res);
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

    const success = await renameDevice(cloudId, deviceId, name.trim());
    if (!success) return fail(res, 404, 'Device not found');
    return ok(res, {});
  } catch (err: any) {
    return fail(res, 500, 'Failed to rename device', err.message);
  }
});
