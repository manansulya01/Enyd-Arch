'use server';

/**
 * Projects
 *
 * Rooms for collaborative work. A project gets a conversation automatically,
 * so discussion lives next to the task board and the file tray rather than in
 * another app.
 */
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '~db';
import {
  blocks,
  conversationMembers,
  conversations,
  files,
  projectMembers,
  projectResources,
  projects,
  projectTasks,
  matches,
  users,
} from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { slugify } from '~/lib/format';
import { can, currentActor } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrf, verifyCsrfValue } from '~/server/csrf';
import { isUuid } from '~/server/auth/identifiers';

export async function createProject(
  _previous: ActionResult<{ slug: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ slug: string }>> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Slow down a moment.');

  const title = String(formData.get('title') ?? '').trim().slice(0, 160);
  const summary = String(formData.get('summary') ?? '').trim().slice(0, 400);
  const description = String(formData.get('description') ?? '').trim().slice(0, 4000);
  const lifespan = String(formData.get('lifespan') ?? 'permanent') === 'temporary' ? 'temporary' : 'permanent';

  if (title.length < 2) return fail('Give the project a title.', { title: ['Too short.'] });

  const base = slugify(title) || 'project';
  let slug = base;
  for (let attempt = 1; attempt < 20; attempt += 1) {
    const taken = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, slug))
      .limit(1);
    if (!taken[0]) break;
    slug = `${base}-${attempt + 1}`;
  }

  const [created] = await db
    .insert(projects)
    .values({ slug, title, summary, description, lifespan, ownerId: actor.userId })
    .returning({ id: projects.id, slug: projects.slug });

  await db.insert(projectMembers).values({ projectId: created!.id, userId: actor.userId, role: 'owner' });

  const [conversation] = await db
    .insert(conversations)
    .values({ kind: 'project', title, projectId: created!.id, createdById: actor.userId })
    .returning({ id: conversations.id });
  await db.insert(conversationMembers).values({
    conversationId: conversation!.id,
    userId: actor.userId,
    role: 'owner',
  });

  revalidatePath('/projects');
  return ok({ slug: created!.slug });
}

export async function joinProject(projectId: string, csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'post')) return fail('Project membership is not available for this identity.');
  if (!isUuid(projectId)) return fail('That project is not available.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before joining another project.');

  const [project] = await db
    .select({ id: projects.id, ownerId: projects.ownerId })
    .from(projects)
    .innerJoin(users, eq(users.id, projects.ownerId))
    .where(and(
      eq(projects.id, projectId),
      eq(projects.status, 'active'),
      isNull(projects.removedAt),
      eq(users.status, 'active'),
      isNull(users.removedAt),
      or(
        inArray(projects.visibility, ['public', 'members']),
        and(
          eq(projects.visibility, 'connections'),
          sql`exists (
            select 1 from ${matches} m
            where m.status = 'accepted'
              and ((m.user_a_id = ${projects.ownerId} and m.user_b_id = ${actor.userId})
                or (m.user_b_id = ${projects.ownerId} and m.user_a_id = ${actor.userId}))
          )`,
        ),
      ),
      sql`not exists (
        select 1 from ${blocks} b
        where (b.blocker_id = ${actor.userId} and b.blocked_id = ${projects.ownerId})
           or (b.blocker_id = ${projects.ownerId} and b.blocked_id = ${actor.userId})
      )`,
    ))
    .limit(1);
  if (!project) return fail('That project is not available to join.');

  await db
    .insert(projectMembers)
    .values({ projectId, userId: actor.userId, role: 'contributor' })
    .onConflictDoNothing();

  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.projectId, projectId), isNull(conversations.removedAt)))
    .limit(1);
  if (conversation) {
    await db
      .insert(conversationMembers)
      .values({ conversationId: conversation.id, userId: actor.userId, role: 'member' })
      .onConflictDoNothing();
  }

  revalidatePath('/projects');
  return ok();
}

async function projectRole(projectId: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export async function addProjectTask(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const projectId = String(formData.get('projectId') ?? '');
  const title = String(formData.get('title') ?? '').trim().slice(0, 200);
  const detail = String(formData.get('detail') ?? '').trim().slice(0, 2000);
  if (!isUuid(projectId)) return fail('That project is not available.');
  if (title.length < 2) return fail('Add a task title.');

  const role = await projectRole(projectId, actor.userId);
  if (!role) return fail('You are not a member of that project.');

  const latest = await db
    .select({ position: projectTasks.position })
    .from(projectTasks)
    .where(eq(projectTasks.projectId, projectId))
    .orderBy(desc(projectTasks.position))
    .limit(1);

  await db.insert(projectTasks).values({
    projectId,
    title,
    detail,
    position: (latest[0]?.position ?? -1) + 1,
    createdBy: actor.userId,
  });
  const totalAfter = await countRows('taskCount', projectId);
  const openAfter = await countRows('openTasks', projectId);
  await db.update(projects).set({ taskCount: totalAfter, openTasks: openAfter }).where(eq(projects.id, projectId));

  revalidatePath('/projects');
  return ok();
}

async function countRows(_which: string, projectId: string): Promise<number> {
  const rows = await db
    .select({ id: projectTasks.id, status: projectTasks.status })
    .from(projectTasks)
    .where(eq(projectTasks.projectId, projectId));
  return _which === 'openTasks' ? rows.filter((row) => row.status !== 'done').length : rows.length;
}

export async function setTaskStatus(taskId: string, status: string, csrf: string): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!isUuid(taskId)) return fail('Task not found.');
  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) return fail('Please wait before changing task status.');

  const allowed = ['todo', 'doing', 'done'];
  if (!allowed.includes(status)) return fail('Unknown status.');

  const [task] = await db
    .select({ projectId: projectTasks.projectId })
    .from(projectTasks)
    .where(eq(projectTasks.id, taskId))
    .limit(1);
  if (!task) return fail('Task not found.');

  const role = await projectRole(task.projectId, actor.userId);
  if (!role) return fail('You are not a member of that project.');

  await db.update(projectTasks).set({ status }).where(eq(projectTasks.id, taskId));

  const open = await countRows('openTasks', task.projectId);
  const total = await countRows('taskCount', task.projectId);
  await db.update(projects).set({ openTasks: open, taskCount: total }).where(eq(projects.id, task.projectId));

  revalidatePath('/projects');
  return ok();
}

export async function addProjectResource(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');

  const projectId = String(formData.get('projectId') ?? '');
  const fileId = String(formData.get('fileId') ?? '');
  const caption = String(formData.get('caption') ?? '').trim().slice(0, 160);
  if (!isUuid(projectId) || !isUuid(fileId)) return fail('Choose an available file and project.');

  const role = await projectRole(projectId, actor.userId);
  if (!role) return fail('You are not a member of that project.');

  const [owned] = await db
    .select({ id: files.id })
    .from(files)
     .where(and(
      eq(files.id, fileId),
      eq(files.uploaderId, actor.userId),
      eq(files.state, 'clean'),
      isNull(files.removedAt),
      sql`exists (select 1 from storage_objects so where so.id = ${files.storageObjectId} and so.removed_at is null)`,
    ))
    .limit(1);
  if (!owned) return fail('That file is not available.');

  await db.insert(projectResources).values({ projectId, fileId, caption, addedBy: actor.userId });
  revalidatePath('/projects');
  return ok();
}
