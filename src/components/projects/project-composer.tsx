'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createProject } from '~/server/actions/projects';

export function ProjectComposer({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const [result, action, pending] = useActionState(createProject, null);
  useEffect(() => {
    if (result?.ok && result.data?.slug) router.push('/projects/' + result.data.slug);
  }, [result, router]);

  return (
    <form action={action} className="panel panel-body stack-3">
      <h2>Start a project</h2>
      <input type="hidden" name="__csrf" value={csrfToken} />
      <label className="field"><span className="field-label">Title</span><input className="input" name="title" required minLength={2} maxLength={160} placeholder="Campus zine, study group, game jam…" /></label>
      <label className="field"><span className="field-label">Summary</span><input className="input" name="summary" maxLength={400} placeholder="A short pitch for collaborators" /></label>
      <label className="field"><span className="field-label">Description</span><textarea className="input" name="description" rows={3} maxLength={4000} /></label>
      <label className="field"><span className="field-label">Lifespan</span><select className="input" name="lifespan" defaultValue="permanent"><option value="permanent">Ongoing</option><option value="temporary">Temporary</option></select></label>
      {result?.message && !result.ok && <p className="notice notice-danger" role="alert">{result.message}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create project'}</button>
    </form>
  );
}
