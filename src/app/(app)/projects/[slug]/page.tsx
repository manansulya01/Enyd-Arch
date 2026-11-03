import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { requireOnboarded } from '~/server/guard';
import { projectBySlug } from '~/server/queries';
import { relativeTime } from '~/lib/format';

export const metadata: Metadata = { title: 'Project workspace' };

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;
  const project = await projectBySlug(slug, actor.userId);
  if (!project) notFound();

  return (
    <PageShell title={project.title} sub={`Owned by ${project.owner.displayName} · ${project.status}`}>
      <div className="stack stack-5">
        <Link className="lnk" href="/projects">← Back to Projects</Link>
        <p className="prose">{project.description}</p>
        <section className="stack stack-3">
          <h2 className="t-section">Tasks</h2>
          {project.tasks.length === 0 ? (
            <EmptyState glyph="⌘" title="No tasks yet." body="This workspace has no tasks to show." />
          ) : (
            <div className="stack stack-2">
              {project.tasks.map((task) => (
                <article className="card card-pad-md" key={task.id}>
                  <div className="row row-between">
                    <strong>{task.title}</strong>
                    <span className="t-meta">{task.status}</span>
                  </div>
                  {task.detail && <p className="t-small t-subtle">{task.detail}</p>}
                  <span className="t-meta">
                    {task.assignee ? `Assigned to ${task.assignee.displayName}` : 'Unassigned'}
                    {task.dueAt ? ` · due ${relativeTime(task.dueAt)}` : ''}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="stack stack-3">
          <h2 className="t-section">Resources</h2>
          {project.resources.length === 0 ? (
            <p className="t-small t-subtle">No resources have been attached.</p>
          ) : (
            <div className="stack stack-2">
              {project.resources.map((resource) => (
                <a className="card card-pad-md" href={`/files/${resource.fileId}`} key={resource.fileId}>
                  <strong>{resource.displayName}</strong>
                  <span className="t-meta">{resource.contentType} · {Math.ceil(resource.byteSize / 1024)} KB</span>
                  {resource.caption && <span className="t-small t-subtle">{resource.caption}</span>}
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
