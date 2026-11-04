'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { joinProject } from '~/server/actions/projects';

export function JoinProjectButton({ projectId, csrfToken }: { projectId: string; csrfToken: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function join() {
    setPending(true); setError('');
    try {
      const result = await joinProject(projectId, csrfToken);
      if (result.ok) router.refresh();
      else setError(result.message ?? 'Could not join this project.');
    } catch {
      setError('Could not join this project. Please try again.');
    } finally { setPending(false); }
  }
  return <div className="stack stack-2"><button className="btn btn-primary" type="button" onClick={() => void join()} disabled={pending}>{pending ? 'Joining…' : 'Join project'}</button>{error && <p className="field-error" role="alert">{error}</p>}</div>;
}
