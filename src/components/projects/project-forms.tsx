'use client';

import type { FormEvent, ReactNode } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addProjectTask, createProject, setTaskStatus } from '~/server/actions/projects';

export function ProjectCreateForm({ csrf }: { csrf: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createProject(null, data);
      if (!result.ok || !result.data) {
        setError(result.message ?? 'The project could not be created.');
        return;
      }
      router.push(`/projects/${result.data.slug}`);
      router.refresh();
    });
  }

  return (
    <form className="panel panel-body stack stack-3" onSubmit={submit}>
      {csrf}
      <h2 className="t-heading">Start a project</h2>
      <label className="field">
        <span className="field-label">Title</span>
        <input className="input" name="title" minLength={2} maxLength={160} required />
      </label>
      <label className="field">
        <span className="field-label">Short summary</span>
        <input className="input" name="summary" maxLength={400} />
      </label>
      <label className="field">
        <span className="field-label">Description</span>
        <textarea className="textarea" name="description" maxLength={4000} rows={3} />
      </label>
      <label className="field">
        <span className="field-label">Duration</span>
        <select className="select" name="lifespan" defaultValue="permanent">
          <option value="permanent">Ongoing</option>
          <option value="temporary">Temporary</option>
        </select>
      </label>
      {error && <p className="t-danger" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create project'}
      </button>
    </form>
  );
}

export function ProjectTaskForm({ projectId, csrf }: { projectId: string; csrf: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set('projectId', projectId);
    startTransition(async () => {
      const result = await addProjectTask(null, data);
      if (!result.ok) {
        setError(result.message ?? 'The task could not be added.');
        return;
      }
      form.reset();
      router.refresh();
    });
  }

  return (
    <form className="panel panel-body stack stack-3" onSubmit={submit}>
      {csrf}
      <h2 className="t-heading">Add a task</h2>
      <label className="field">
        <span className="field-label">Task</span>
        <input className="input" name="title" minLength={2} maxLength={200} required />
      </label>
      <label className="field">
        <span className="field-label">Details</span>
        <textarea className="textarea" name="detail" maxLength={2000} rows={2} />
      </label>
      {error && <p className="t-danger" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add task'}
      </button>
    </form>
  );
}

export function TaskStatusControl({ taskId, status }: { taskId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = status === 'todo' ? 'doing' : status === 'doing' ? 'done' : 'todo';

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={pending}
      onClick={() => startTransition(async () => {
        const result = await setTaskStatus(taskId, next);
        if (result.ok) router.refresh();
      })}
      title="Move task to the next status"
    >
      {pending ? 'Saving…' : `${status} → ${next}`}
    </button>
  );
}
