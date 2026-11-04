'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addProjectTask, setTaskStatus } from '~/server/actions/projects';

export function ProjectTaskComposer({ projectId, csrfToken }: { projectId: string; csrfToken: string }) {
  const router = useRouter();
  const [result, action, pending] = useActionState(addProjectTask, null);
  useEffect(() => { if (result?.ok) router.refresh(); }, [result, router]);
  return (
    <form action={action} className="panel panel-body stack-3">
      <h2>Add a task</h2>
      <input type="hidden" name="__csrf" value={csrfToken} />
      <input type="hidden" name="projectId" value={projectId} />
      <label className="field"><span className="field-label">Task</span><input className="input" name="title" required minLength={2} maxLength={200} /></label>
      <label className="field"><span className="field-label">Details</span><textarea className="input" name="detail" rows={2} maxLength={2000} /></label>
      {result?.message && !result.ok && <p className="notice notice-danger" role="alert">{result.message}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? 'Adding…' : 'Add task'}</button>
    </form>
  );
}

export function ProjectTaskStatusButton({ taskId, status, csrfToken }: { taskId: string; status: string; csrfToken: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function update() {
    setPending(true); setError('');
    const next = status === 'done' ? 'todo' : 'done';
    try {
      const result = await setTaskStatus(taskId, next, csrfToken);
      if (result.ok) router.refresh();
      else setError(result.message ?? 'Could not update task.');
    } catch { setError('Could not update task.'); }
    finally { setPending(false); }
  }
  return <div className="stack stack-1"><button className="btn btn-ghost btn-sm" type="button" disabled={pending} onClick={() => void update()}>{status === 'done' ? 'Reopen' : 'Complete'}</button>{error && <span className="field-error">{error}</span>}</div>;
}
