import { useState } from 'react';
import { ShieldAlert, Eye, EyeOff, RefreshCw, AlertTriangle } from 'lucide-react';
import type { CloudSession } from '../lib/api';
import { getRecoveryCode, regenerateSecret } from '../lib/api';

interface RecoveryPageProps {
  session: CloudSession;
  onLogout: () => void;
}

export function RecoveryPage({ session, onLogout }: RecoveryPageProps) {
  const [showSecret, setShowSecret] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [codeRevealed, setCodeRevealed] = useState(false);
  const [codeConfirmStep, setCodeConfirmStep] = useState(false);
  const [newSecret, setNewSecret] = useState('');
  const [confirmSecret, setConfirmSecret] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [regenerateConfirm, setRegenerateConfirm] = useState(false);

  const maskedSecret = session.secret.slice(0, 3) + '*'.repeat(Math.max(0, session.secret.length - 3));

  const fetchRecoveryCode = async () => {
    setError('');
    if (!codeConfirmStep) {
      setCodeConfirmStep(true);
      return;
    }
    try {
      const result = await getRecoveryCode(session);
      setRecoveryCode(result.code);
      setCodeRevealed(true);
    } catch (err: any) {
      setError(err.message);
    }
    setCodeConfirmStep(false);
  };

  const handleRegenerate = async () => {
    setError('');
    setSuccess('');
    if (!newSecret || newSecret.length < 8) { setError('New secret must be at least 8 characters'); return; }
    if (newSecret !== confirmSecret) { setError('Secrets do not match'); return; }
    if (!regenerateConfirm) {
      setRegenerateConfirm(true);
      return;
    }
    setLoading(true);
    try {
      await regenerateSecret(session, newSecret);
      session.secret = newSecret;
      sessionStorage.setItem('sc_session', JSON.stringify(session));
      setSuccess('Credentials regenerated successfully!');
      setNewSecret('');
      setConfirmSecret('');
      setRegenerateConfirm(false);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const cancelRegenerate = () => {
    setRegenerateConfirm(false);
    setNewSecret('');
    setConfirmSecret('');
    setError('');
  };

  return (
    <>
      <div className="panel">
        <p className="section-title"><ShieldAlert size={18} style={{ verticalAlign: -3, marginRight: 6 }} /> Recovery</p>
        <p className="small-text">Manage your account credentials and recovery options.</p>
      </div>

      <div className="panel">
        <p className="section-title">Your Credentials</p>
        <div style={{ marginBottom: 12 }}>
          <p className="small-text">Cloud ID</p>
          <span className="cloud-id-display" style={{ fontSize: '1rem' }}>{session.cloudId}</span>
        </div>
        <div>
          <p className="small-text">Secret</p>
          <div className="filter-group">
            <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', userSelect: showSecret ? 'text' : 'none' }}>
              {showSecret ? session.secret : maskedSecret}
            </span>
            <button className="btn btn-sm" onClick={() => setShowSecret(!showSecret)}>
              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p className="muted-text" style={{ marginTop: 6 }}>Secret is masked by default for your security.</p>
        </div>
      </div>

      <div className="panel">
        <p className="section-title">Recovery Code</p>
        <p className="small-text">Your recovery code can be used to regain access if you lose your secret.</p>
        {codeRevealed ? (
          <div style={{ marginTop: 12 }}>
            <span style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)', userSelect: 'all' }}>
              {recoveryCode}
            </span>
            <p className="muted-text" style={{ marginTop: 8 }}>Keep this code private and safe.</p>
          </div>
        ) : codeConfirmStep ? (
          <div className="warning-box" style={{ marginTop: 12 }}>
            <p><strong>Are you sure?</strong> Make sure no one is looking at your screen. Recovery codes grant full account access.</p>
            <div className="filter-group" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" onClick={fetchRecoveryCode}>Yes, show code</button>
              <button className="btn" onClick={() => setCodeConfirmStep(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={fetchRecoveryCode}>
            Show Recovery Code
          </button>
        )}
      </div>

      <div className="panel">
        <p className="section-title">Regenerate Credentials</p>
        <div className="warning-box">
          <p><strong>Warning:</strong> Regenerating your secret will invalidate the old one. All devices will need to reconnect with the new secret.</p>
        </div>
        {regenerateConfirm ? (
          <div style={{ marginTop: 12 }}>
            <div className="warning-box" style={{ borderColor: 'var(--danger)' }}>
              <p><AlertTriangle size={16} style={{ verticalAlign: -2 }} /> This will sign out all connected devices. Are you absolutely sure?</p>
            </div>
            <div className="filter-group" style={{ marginTop: 10 }}>
              <button className="btn btn-danger" onClick={handleRegenerate} disabled={loading}>
                {loading ? 'Regenerating...' : 'Confirm Regeneration'}
              </button>
              <button className="btn" onClick={cancelRegenerate}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            <input className="input-field" type="password" placeholder="New secret (min 8 characters)" value={newSecret} onChange={(e) => setNewSecret(e.target.value)} autoComplete="new-password" />
            <input className="input-field" type="password" placeholder="Confirm new secret" value={confirmSecret} onChange={(e) => setConfirmSecret(e.target.value)} autoComplete="new-password" />
            <button className="btn btn-danger" onClick={handleRegenerate} disabled={loading || !newSecret || !confirmSecret}>
              <RefreshCw size={16} /> {loading ? 'Regenerating...' : 'Regenerate Secret'}
            </button>
          </div>
        )}
        {error && <p className="small-text" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
        {success && <div className="success-box" style={{ marginTop: 8 }}><p>{success}</p></div>}
      </div>
    </>
  );
}
