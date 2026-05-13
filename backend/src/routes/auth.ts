import { Router } from 'express';
import { createUser, validateCredentials, getAccountInfo, recoverAccount, regenerateCredentials, linkDevice, updateDeviceActivity, getRecoveryCodeByCloudId, cloudIdPattern, getUserAuthRow } from '../db.js';

export const authRouter = Router();

function ok(res: any, data: Record<string, any>) {
  return res.json({ success: true, ...data });
}

function fail(res: any, status: number, error: string, details?: string) {
  return res.status(status).json({ success: false, error, details });
}

authRouter.post('/create-account', (req, res) => {
  try {
    const { deviceId, secret, deviceName } = req.body;
    const normalizedDeviceId = typeof deviceId === 'string' ? deviceId.trim() : deviceId;
    const normalizedSecret = typeof secret === 'string' ? secret.trim() : secret;

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

    const { cloudId, recoveryCode } = createUser(normalizedSecret);
    linkDevice(cloudId, normalizedDeviceId, typeof deviceName === 'string' ? deviceName.trim().slice(0, 100) : undefined);

    return ok(res, { cloudId, recoveryCode });
  } catch (err: any) {
    return fail(res, 500, 'Failed to create account', err.message);
  }
});

authRouter.post('/link-device', (req, res) => {
  try {
    const { cloudId, secret, deviceId, deviceName } = req.body;
    const normalizedCloudId = typeof cloudId === 'string' ? cloudId.trim().toUpperCase() : cloudId;
    const normalizedSecret = typeof secret === 'string' ? secret.trim() : secret;
    const normalizedDeviceId = typeof deviceId === 'string' ? deviceId.trim() : deviceId;

    if (!normalizedCloudId || typeof normalizedCloudId !== 'string' || !cloudIdPattern().test(normalizedCloudId)) {
      return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
    }
    if (!normalizedSecret || typeof normalizedSecret !== 'string') {
      return fail(res, 400, 'secret is required');
    }
    if (!normalizedDeviceId || typeof normalizedDeviceId !== 'string') {
      return fail(res, 400, 'deviceId is required and must be a string');
    }
    if (!validateCredentials(normalizedCloudId, normalizedSecret)) {
      return fail(res, 401, 'Invalid credentials');
    }

    linkDevice(normalizedCloudId, normalizedDeviceId, typeof deviceName === 'string' ? deviceName.trim().slice(0, 100) : undefined);
    return ok(res, { cloudId: normalizedCloudId });
  } catch (err: any) {
    return fail(res, 500, 'Failed to link device', err.message);
  }
});

authRouter.post('/validate', (req, res) => {
  try {
    const { cloudId, secret } = req.body;
    const normalizedCloudId = typeof cloudId === 'string' ? cloudId.trim().toUpperCase() : cloudId;
    const normalizedSecret = typeof secret === 'string' ? secret.trim() : secret;

    if (!normalizedCloudId || typeof normalizedCloudId !== 'string' || !cloudIdPattern().test(normalizedCloudId)) {
      return fail(res, 400, 'cloudId is required');
    }
    if (!normalizedSecret || typeof normalizedSecret !== 'string') {
      return fail(res, 400, 'secret is required');
    }

    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      const row = getUserAuthRow(normalizedCloudId);
      console.log('Validating cloudId:', normalizedCloudId);
      console.log('User found:', !!row);
    }

    const valid = validateCredentials(normalizedCloudId, normalizedSecret);
    if (!valid) {
      return fail(res, 401, 'Invalid credentials');
    }

    const info = getAccountInfo(normalizedCloudId);
    return ok(res, { cloudId: info?.cloudId, createdAt: info?.createdAt });
  } catch (err: any) {
    return fail(res, 500, 'Validation failed', err.message);
  }
});

authRouter.post('/recover', (req, res) => {
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

    const result = recoverAccount(normalizedRecovery, normalizedNewSecret);
    if (!result) {
      return fail(res, 404, 'Invalid recovery code');
    }
    return ok(res, { cloudId: result.cloudId });
  } catch (err: any) {
    return fail(res, 500, 'Recovery failed', err.message);
  }
});

authRouter.post('/regenerate', (req, res) => {
  try {
    const { cloudId, oldSecret, newSecret } = req.body;
    const normalizedCloudId = typeof cloudId === 'string' ? cloudId.trim().toUpperCase() : cloudId;
    const normalizedOldSecret = typeof oldSecret === 'string' ? oldSecret.trim() : oldSecret;
    const normalizedNewSecret = typeof newSecret === 'string' ? newSecret.trim() : newSecret;

    if (!normalizedCloudId || typeof normalizedCloudId !== 'string' || !cloudIdPattern().test(normalizedCloudId)) {
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

    const success = regenerateCredentials(normalizedCloudId, normalizedOldSecret, normalizedNewSecret);
    if (!success) {
      return fail(res, 401, 'Invalid credentials');
    }
    return ok(res, {});
  } catch (err: any) {
    return fail(res, 500, 'Regeneration failed', err.message);
  }
});

authRouter.get('/account/:cloudId', (req, res) => {
  try {
    const cloudIdRaw = req.params.cloudId as string;
    const secretRaw = req.headers['x-secret'] as string;
    const cloudId = typeof cloudIdRaw === 'string' ? cloudIdRaw.trim().toUpperCase() : cloudIdRaw;
    const secret = typeof secretRaw === 'string' ? secretRaw.trim() : secretRaw;

    if (!cloudId || !cloudIdPattern().test(cloudId)) {
      return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
    }
    if (!secret || typeof secret !== 'string') {
      return fail(res, 400, 'x-secret header is required');
    }
    if (!validateCredentials(cloudId, secret)) {
      return fail(res, 401, 'Invalid credentials');
    }

    const info = getAccountInfo(cloudId);
    if (!info) return fail(res, 404, 'Account not found');
    return ok(res, { cloudId: info.cloudId, createdAt: info.createdAt });
  } catch (err: any) {
    return fail(res, 500, 'Failed to get account info', err.message);
  }
});

authRouter.get('/recovery-code/:cloudId', (req, res) => {
  try {
    const cloudIdRaw = req.params.cloudId as string;
    const secretRaw = req.headers['x-secret'] as string;
    const cloudId = typeof cloudIdRaw === 'string' ? cloudIdRaw.trim().toUpperCase() : cloudIdRaw;
    const secret = typeof secretRaw === 'string' ? secretRaw.trim() : secretRaw;

    if (!cloudId || !cloudIdPattern().test(cloudId)) {
      return fail(res, 400, 'Valid cloudId is required (format: SA-CLD-XXXXXXXX)');
    }
    if (!secret || typeof secret !== 'string') {
      return fail(res, 400, 'x-secret header is required');
    }
    if (!validateCredentials(cloudId, secret)) {
      return fail(res, 401, 'Invalid credentials');
    }

    const code = getRecoveryCodeByCloudId(cloudId);
    if (!code) return fail(res, 404, 'Recovery code not found');
    return ok(res, { code });
  } catch (err: any) {
    return fail(res, 500, 'Failed to get recovery code', err.message);
  }
});
