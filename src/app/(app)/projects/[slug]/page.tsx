import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '~/components/ui/page-shell';
import { CsrfField } from '~/components/shell/csrf-field';
import { ProjectTaskForm, TaskStatusControl } from '~/components/projects/project-forms';
import { projectBySlug } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'Project room' };

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { actor } = await requireOnboarded();
  const { slug } = await params;
  const project = await projectBySlug(slug, actor.userId);
  if (!project) notFound();

  return (
    <PageShell
      title={project.title}
      sub={project.summary || 'A private room for shared work.'}
      actions={<Link className="btn btn-ghost btn-sm" href="/projects">All projects</Link>}
      wide
    >
      <div className="page-split">
        <div className="stack stack-5">
          <section className="panel panel-body stack stack-3">
            <div className="row row-wrap row-between">
              <span className="badge">{project.status}</span>
              <span className="t-meta">{project.memberCount} members · {project.openTasks} open tasks</span>
            </div>
            <p className="t-body">{project.description || project.summary || 'No description yet.'}</p>
            {project.conversationId && (
              <Link className="btn btn-secondary" href={`/messages?conversation=${project.conversationId}`}>
                Open project conversation
              </Link>
            )}
          </section>

          <section className="stack stack-3">
            <h2 className="t-heading">Task board</h2>
            {project.tasks.length === 0 ? (
              <p className="t-subtle">No tasks yet. Add the first task to give the project a next step.</p>
            ) : (
              project.tasks.map((task) => (
                <article key={task.id} className="card card-pad stack stack-2">
                  <div className="row row-wrap row-between">
                    <h3 className="t-label">{task.title}</h3>
                    <TaskStatusControl taskId={task.id} status={task.status} />
                  </div>
                  {task.detail && <p className="t-small t-subtle">{task.detail}</p>}
                  {task.assignee && <p className="t-meta">Assigned to @{task.assignee.username}</p>}
                </article>
              ))
            )}
          </section>

          <section className="stack stack-3">
            <h2 className="t-heading">Members</h2>
            <div className="panel panel-body stack stack-2">
              {project.members.map((member) => (
                <div key={member.userId} className="row row-between">
                  <Link href={`/profile/${member.username}`}>{member.displayName} <span className="t-meta">@{member.username}</span></Link>
                  <span className="badge">{member.role}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="stack stack-3">
            <h2 className="t-heading">Shared resources</h2>
            {project.resources.length === 0 ? (
              <p className="t-subtle">No files have been attached to this project.</p>
            ) : (
              <div className="panel panel-body stack stack-2">
                {project.resources.map((resource) => (
                  <a key={resource.fileId} className="row row-between" href={`/files/${resource.fileId}`}>
                    <span>{resource.caption || resource.displayName}</span>
                    <span className="t-meta">{resource.contentType}</span>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>
        <aside>
          <ProjectTaskForm projectId={project.id} csrf={<CsrfField />} />
        </aside>
      </div>
    </PageShell>
  );
}
