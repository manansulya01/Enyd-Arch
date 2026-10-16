import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState } from '~/components/ui';
import { CsrfField } from '~/components/shell/csrf-field';
import { ProjectCreateForm } from '~/components/projects/project-forms';
import { projectList } from '~/server/queries';
import { requireOnboarded } from '~/server/guard';

export const metadata: Metadata = { title: 'Projects' };

export default async function ProjectsPage() {
  const { actor } = await requireOnboarded();
  const projects = await projectList(actor.userId, 60);

  return (
    <PageShell title="Projects" sub="Rooms for collaborative work." wide>
      <div className="page-split">
        <section className="stack stack-4">
          {projects.length === 0 ? (
            <EmptyState
              glyph="⌘"
              title="No projects yet."
              body="Start a room for a project. Members can join, keep tasks, share files, and talk in its private conversation."
            />
          ) : (
            <div className="stack stack-3">
              {projects.map((project) => (
                <Link key={project.id} href={`/projects/${project.slug}`} className="card card-pad card-interactive stack stack-2">
                  <div className="row row-between">
                    <h2 className="t-heading">{project.title}</h2>
                    <span className="badge">{project.status}</span>
                  </div>
                  {project.summary && <p className="t-body">{project.summary}</p>}
                  <p className="t-meta">
                    {project.memberCount} members · {project.openTasks}/{project.taskCount} open tasks · by @{project.owner.username}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
        <aside>
          <ProjectCreateForm csrf={<CsrfField />} />
        </aside>
      </div>
    </PageShell>
  );
}
