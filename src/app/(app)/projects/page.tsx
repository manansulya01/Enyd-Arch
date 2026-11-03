import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { requireOnboarded } from '~/server/guard';
import { projectList } from '~/server/queries';
import { relativeTime } from '~/lib/format';

export const metadata: Metadata = { title: 'Projects' };

export default async function ProjectsPage() {
  const { actor } = await requireOnboarded();
  const projects = await projectList(actor.userId, 36);

  return (
    <PageShell title="Projects" sub="Shared workspaces, tasks and resources.">
      {projects.length === 0 ? (
        <EmptyState glyph="⌘" title="No projects in your workspace." body="Projects you own or have joined will appear here." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <Link className="card card-pad-md stack stack-2" href={`/projects/${project.slug}`} key={project.id}>
              <div className="row row-between">
                <span className="t-meta">{project.status}</span>
                <span className="t-meta">{project.memberCount} members</span>
              </div>
              <h2 className="t-section">{project.title}</h2>
              <p className="t-small t-subtle">{project.summary}</p>
              <span className="t-meta">Owned by {project.owner.displayName} · {relativeTime(project.createdAt)}</span>
              <span className="t-meta">{project.openTasks} open of {project.taskCount} tasks</span>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
