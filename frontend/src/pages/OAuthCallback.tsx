import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { completeOAuth, storeOAuthToken } from '../lib/api';

interface OAuthCallbackProps {
  onDone: () => void;
}

export function OAuthCallback({ onDone }: OAuthCallbackProps) {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing OAuth redirect...');

  useEffect(() => {
    try {
      const hash = window.location.hash;
      if (!hash || !hash.includes('access_token=')) {
        setStatus('error');
        setMessage('No access token found in URL. Make sure you authorized the application correctly.');
        return;
      }

      const params = new URLSearchParams(hash.replace('#', '?'));
      const accessToken = params.get('access_token');
      if (!accessToken) {
        setStatus('error');
        setMessage('Could not extract access token from redirect URL.');
        return;
      }

      fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ query: '{ Viewer { id name } }' }),
      })
        .then((r) => r.json())
        .then(async (data) => {
          const username = data?.data?.Viewer?.name;
          if (!username) {
            setStatus('error');
            setMessage('Could not verify AniList token. The token may be invalid or expired.');
            return;
          }

          const initToken = sessionStorage.getItem('oauth_init_token');
          if (initToken) {
            sessionStorage.removeItem('oauth_init_token');
            await completeOAuth(initToken, accessToken, username);
          } else {
            const saved = sessionStorage.getItem('sc_session');
            if (!saved) {
              setStatus('error');
              setMessage('Could not link AniList to your account. Please log into SaintlyCloud first, then try connecting AniList again.');
              return;
            }
            const session = JSON.parse(saved);
            await storeOAuthToken(session, accessToken, username);
          }

          setStatus('success');
          setMessage(`AniList connected as ${username}! Redirecting...`);
          setTimeout(() => {
            window.location.hash = '';
            onDone();
          }, 2000);
        })
        .catch((err) => {
          setStatus('error');
          setMessage(`Failed to verify token: ${err.message}`);
        });
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'Unexpected error during OAuth handling');
    }
  }, [onDone]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        {status === 'processing' && (
          <>
            <div className="skeleton-video" style={{ margin: '0 auto 16px' }} />
            <h2>Completing Authorization...</h2>
            <p className="small-text">{message}</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 size={48} style={{ color: 'var(--success)', marginBottom: 16 }} />
            <h2>Connected!</h2>
            <p className="small-text">{message}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertTriangle size={48} style={{ color: 'var(--danger)', marginBottom: 16 }} />
            <h2>Connection Failed</h2>
            <p className="small-text">{message}</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onDone}>
              Back to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
