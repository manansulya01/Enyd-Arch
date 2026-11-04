import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { ProjectComposer } from '~/components/projects/project-composer';
import { requireOnboarded } from '~/server/guard';
import { projectList } from '~/server/queries';
import { sessionCsrfToken } from '~/server/csrf';

export const metadata: Metadata = { title: 'Projects' };

export default async function ProjectsPage() {
  const { actor } = await requireOnboarded();
  const [projects, csrfToken] = await Promise.all([projectList(actor.userId, 60), sessionCsrfToken()]);
  return (
    <PageShell title="Projects" sub="Shared workspaces for ideas that deserve more than a chat thread." wide>
      <ProjectComposer csrfToken={csrfToken} />
      <section className="stack stack-3">
        <h2 className="section-heading">Projects you can explore</h2>
        {projects.length === 0 ? <div className="panel panel-body"><h3>Nothing underway yet</h3><p className="t-small t-muted">Start a project or check back when members publish their work.</p></div> : projects.map((project) => (
          <article key={project.id} className="panel panel-body">
            <p className="t-meta">{project.status.replaceAll('_', ' ')} · {project.lifespan === 'temporary' ? 'Temporary' : 'Ongoing'}</p>
            <h3><Link href={'/projects/' + project.slug}>{project.title}</Link></h3>
            <p className="t-small t-muted">{project.summary}</p>
            <p className="t-meta">By {project.owner.displayName} · {project.memberCount} members · {project.openTasks} open tasks</p>
          </article>
        ))}
      </section>
    </PageShell>
  );
}
