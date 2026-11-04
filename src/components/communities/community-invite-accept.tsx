'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acceptCommunityInvite } from '~/server/actions/communities';

export function CommunityInviteAccept({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const value = window.location.hash.slice(1);
    if (/^[A-Za-z0-9_-]{40,50}$/.test(value)) {
      setToken(value);
      window.history.replaceState(null, '', window.location.pathname);
    }
    setReady(true);
  }, []);

  function join() {
    setError(null);
    startTransition(async () => {
      const result = await acceptCommunityInvite(token, csrfToken);
      if (!result.ok || !result.data) {
        setError(result.message ?? 'This invite cannot be accepted.');
        return;
      }
      router.push(`/communities/${result.data.slug}`);
      router.refresh();
    });
  }

  return (
    <section className="panel panel-body stack stack-3" aria-label="Accept private community invitation">
      <h2>Join a private community</h2>
      {!ready ? <p className="t-small">Checking invite…</p> : !token ? (
        <p className="t-small t-subtle">This invite link is missing its secret. Ask the community owner for a fresh link.</p>
      ) : (
        <>
          <p className="t-small t-subtle">Joining is explicit. The invite may expire, be revoked, or reach its use limit.</p>
          <button className="btn btn-primary" type="button" disabled={pending} onClick={join}>{pending ? 'Joining…' : 'Accept invitation'}</button>
        </>
      )}
      {error && <p className="notice notice-danger" role="alert">{error}</p>}
    </section>
  );
}
