import { useState } from 'react';
import { createAccount, validateCredentials, recoverAccount } from '../lib/api';
import type { CloudSession } from '../lib/api';
import { Cloud, Key, Shield, ArrowRight } from 'lucide-react';

interface AuthPageProps {
  onAuth: (session: CloudSession) => void;
}

export function AuthPage({ onAuth }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'create' | 'recover'>('login');
  const [cloudId, setCloudId] = useState('');
  const [secret, setSecret] = useState('');
  const [deviceId] = useState(() => crypto.randomUUID());
  const [deviceName] = useState(() => `Device-${Math.random().toString(36).slice(2, 6)}`);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [newId, setNewId] = useState('');

  const handleLogin = async () => {
    setError('');
    if (!cloudId || !secret) { setError('Fill in all fields'); return; }
    setLoading(true);
    try {
      const result = await validateCredentials(cloudId, secret);
      onAuth({ cloudId: result.cloudId, secret, createdAt: result.createdAt });
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    setError('');
    if (!secret || secret.length < 8) { setError('Secret must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const result = await createAccount(deviceId, secret, deviceName);
      setNewId(result.cloudId);
      setRecoveryCode(result.recoveryCode);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleRecover = async () => {
    setError('');
    if (!recoveryCode || !secret || secret.length < 8) { setError('Recovery code and new secret (8+ chars) required'); return; }
    setLoading(true);
    try {
      const result = await recoverAccount(recoveryCode, secret);
      setCloudId(result.cloudId);
      setMode('login');
      setError('Account recovered. Enter your new secret to connect.');
      setRecoveryCode('');
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1><Cloud size={28} style={{ verticalAlign: -4 }} /> Saintly<span>Cloud</span></h1>
        <p className="small-text subtitle">Sync your SaintlyAnime data across devices</p>

        {newId && (
          <div className="success-box" style={{ marginBottom: 16 }}>
            <p><strong>Account created!</strong></p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: 8 }}>
              Your Cloud ID: <strong style={{ color: 'var(--accent)' }}>{newId}</strong>
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: 4 }}>
              Recovery code: <strong>{recoveryCode}</strong>
            </p>
            <p className="small-text" style={{ marginTop: 8, color: 'var(--danger)' }}>
              Save your recovery code! Without it you cannot recover your account.
            </p>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => onAuth({ cloudId: newId, secret })}>
              Enter Dashboard <ArrowRight size={16} />
            </button>
          </div>
        )}

        {!newId && (
          <>
            {mode === 'login' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input className="input-field" placeholder="Cloud ID" value={cloudId} onChange={(e) => setCloudId(e.target.value)} />
                <input className="input-field" type="password" placeholder="Secret" value={secret} onChange={(e) => setSecret(e.target.value)} />
                <button className="btn btn-primary" onClick={handleLogin} disabled={loading}>
                  <Key size={16} /> {loading ? 'Connecting...' : 'Connect'}
                </button>
                {error && <p className="small-text" style={{ color: 'var(--danger)' }}>{error}</p>}
                <div className="divider" />
                <button className="link-btn" onClick={() => { setMode('create'); setError(''); }}>Create new account</button>
                <button className="link-btn" onClick={() => { setMode('recover'); setError(''); }}>Recover account</button>
              </div>
            )}

            {mode === 'create' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p className="small-text">Choose a secret key (at least 8 characters). Your Cloud ID will be generated automatically.</p>
                <input className="input-field" type="password" placeholder="Secret (min 8 characters)" value={secret} onChange={(e) => setSecret(e.target.value)} />
                <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
                  <Shield size={16} /> {loading ? 'Creating...' : 'Create Account'}
                </button>
                {error && <p className="small-text" style={{ color: 'var(--danger)' }}>{error}</p>}
                <div className="divider" />
                <button className="link-btn" onClick={() => { setMode('login'); setError(''); }}>Connect existing account</button>
              </div>
            )}

            {mode === 'recover' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p className="small-text">Enter your recovery code and a new secret to regain access.</p>
                <input className="input-field" placeholder="Recovery code" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} />
                <input className="input-field" type="password" placeholder="New secret (min 8 characters)" value={secret} onChange={(e) => setSecret(e.target.value)} />
                <button className="btn btn-primary" onClick={handleRecover} disabled={loading}>
                  <Shield size={16} /> {loading ? 'Recovering...' : 'Recover Account'}
                </button>
                {error && <p className="small-text" style={{ color: 'var(--danger)' }}>{error}</p>}
                <div className="divider" />
                <button className="link-btn" onClick={() => { setMode('login'); setError(''); }}>Back to login</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
