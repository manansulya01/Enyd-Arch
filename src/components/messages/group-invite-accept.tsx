'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acceptGroupInvite } from '~/server/actions/messages';

export function GroupInviteAccept({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const value = window.location.hash.slice(1);
    if (/^[A-Za-z0-9_-]{40,50}$/.test(value)) {
      setToken(value);
      // Keep the bearer secret out of browser history after reading it.
      window.history.replaceState(null, '', window.location.pathname);
    }
    setReady(true);
  }, []);

  function join() {
    setError(null);
    startTransition(async () => {
      const result = await acceptGroupInvite(token, csrfToken);
      if (!result.ok || !result.data) {
        setError(result.message ?? 'This invite cannot be accepted.');
        return;
      }
      router.push(`/messages?c=${result.data.conversationId}&joined=1`);
      router.refresh();
    });
  }

  return (
    <section className="panel panel-body stack stack-3" aria-label="Accept group invitation">
      <h2>Join a group conversation</h2>
      {!ready ? <p className="t-small">Checking invite…</p> : !token ? (
        <p className="t-small t-subtle">This invite link is missing its secret. Ask the group owner for a fresh link.</p>
      ) : (
        <>
          <p className="t-small t-subtle">Joining is explicit. The link may expire, be revoked, or reach its use limit; your messaging preferences and block relationships are checked before you are added.</p>
          <button className="btn btn-primary" type="button" disabled={pending} onClick={join}>{pending ? 'Joining…' : 'Accept invitation'}</button>
        </>
      )}
      {error && <p className="notice notice-danger" role="alert">{error}</p>}
    </section>
  );
}
