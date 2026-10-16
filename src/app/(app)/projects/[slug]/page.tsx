import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { JoinProjectButton } from '~/components/projects/join-project-button';
import { ProjectTaskComposer, ProjectTaskStatusButton } from '~/components/projects/project-task-controls';
import { requireOnboarded } from '~/server/guard';
import { projectBySlug } from '~/server/queries';
import { sessionCsrfToken } from '~/server/csrf';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { actor } = await requireOnboarded();
  const { slug } = await params;
  const project = await projectBySlug(slug, actor.userId);
  return project ? { title: project.title, description: project.summary } : { title: 'Project not found' };
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;
  const [project, csrfToken] = await Promise.all([projectBySlug(slug, actor.userId), sessionCsrfToken()]);
  if (!project) notFound();
  const isMember = Boolean(project.myRole);

  return (
    <PageShell title={project.title} sub={project.summary} wide>
      <article className="panel panel-body stack-3">
        <p className="t-meta">{project.status.replaceAll('_', ' ')} · {project.lifespan === 'temporary' ? 'Temporary project' : 'Ongoing project'}</p>
        <p>{project.description}</p>
        <p className="t-meta">Owned by {project.owner.displayName} · {project.memberCount} members</p>
        {!isMember && <JoinProjectButton projectId={project.id} csrfToken={csrfToken} />}
        {project.conversationId && isMember && <Link className="btn btn-secondary" href={'/messages/' + project.conversationId}>Open project conversation</Link>}
      </article>

      <section className="stack stack-3">
        <h2 className="section-heading">Task board</h2>
        {project.tasks.length === 0 ? <div className="panel panel-body"><p className="t-small t-muted">No tasks yet.</p></div> : project.tasks.map((task) => (
          <article key={task.id} className="panel panel-body row row-3">
            <div className="grow"><h3>{task.title}</h3>{task.detail && <p className="t-small t-muted">{task.detail}</p>}<p className="t-meta">{task.status.replaceAll('_', ' ')}{task.assignee ? ' · ' + task.assignee.displayName : ''}</p></div>
            {isMember && <ProjectTaskStatusButton taskId={task.id} status={task.status} csrfToken={csrfToken} />}
          </article>
        ))}
        {isMember && <ProjectTaskComposer projectId={project.id} csrfToken={csrfToken} />}
      </section>

      {project.resources.length > 0 && <section className="stack stack-3"><h2 className="section-heading">Resources</h2>{project.resources.map((resource) => <a key={resource.fileId} className="panel panel-body row row-3" href={'/objects/' + resource.fileId}><span className="grow">{resource.displayName}</span><span className="t-meta">{resource.caption}</span></a>)}</section>}
      <Link className="btn btn-ghost" href="/projects">Back to Projects</Link>
    </PageShell>
  );
}
