'use server';

import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '~db';
import { registryItems } from '~db/schema';
import { currentActor } from '~/server/auth/session';
import { randomHex } from '~/server/crypto';
import { fail, ok, type ActionResult } from '~/lib/action-result';

export interface RegistryItemView {
  id: string;
  title: string;
  description: string;
  details: string;
  ownerId: string;
  visibility: 'public' | 'members' | 'connections' | 'private';
  createdAt: Date;
  updatedAt: Date;
}

function slugBase(title: string): string {
  const value = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return value || 'entry';
}

function validateFields(data: {
  title?: string;
  description?: string;
  details?: string;
}): { title?: string; description?: string; details?: string; error?: ActionResult<never> } {
  const title = data.title?.trim();
  const description = data.description?.trim();
  const details = data.details === undefined ? undefined : data.details.trim();

  if (title !== undefined && (title.length < 2 || title.length > 120)) {
    return { error: fail('Use a title between 2 and 120 characters.', { title: ['Use 2–120 characters.'] }) };
  }
  if (description !== undefined && (description.length < 5 || description.length > 2000)) {
    return { error: fail('Use a description between 5 and 2000 characters.', { description: ['Use 5–2000 characters.'] }) };
  }
  if (details !== undefined && details.length > 10000) {
    return { error: fail('Keep details under 10000 characters.', { details: ['Keep details under 10000 characters.'] }) };
  }
  return { title, description, details };
}

async function signedInUser() {
  const actor = await currentActor();
  if (!actor || !actor.onboarded || actor.status !== 'active') return null;
  return actor;
}

/** Returns only entries visible to the current member. */
export async function getRegistryItems(): Promise<ActionResult<RegistryItemView[]>> {
  const actor = await signedInUser();
  if (!actor) return fail('Sign in to view the Registry.');

  const rows = await db
    .select({
      id: registryItems.slug,
      title: registryItems.title,
      description: registryItems.description,
      details: registryItems.details,
      ownerId: registryItems.ownerId,
      visibility: registryItems.visibility,
      createdAt: registryItems.createdAt,
      updatedAt: registryItems.updatedAt,
    })
    .from(registryItems)
    .where(
      and(
        isNull(registryItems.removedAt),
        or(
          eq(registryItems.visibility, 'public'),
          eq(registryItems.visibility, 'members'),
          eq(registryItems.ownerId, actor.userId),
        ),
      ),
    )
    .orderBy(desc(registryItems.createdAt))
    .limit(100);

  return ok(rows as RegistryItemView[]);
}

/** Looks up a visible Registry entry by its opaque, non-sequential slug. */
export async function getRegistryItemById(slug: string): Promise<ActionResult<RegistryItemView | null>> {
  const actor = await signedInUser();
  if (!actor) return fail('Sign in to view the Registry entry.');
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return ok(null);

  const rows = await db
    .select({
      id: registryItems.slug,
      title: registryItems.title,
      description: registryItems.description,
      details: registryItems.details,
      ownerId: registryItems.ownerId,
      visibility: registryItems.visibility,
      createdAt: registryItems.createdAt,
      updatedAt: registryItems.updatedAt,
    })
    .from(registryItems)
    .where(and(eq(registryItems.slug, slug), isNull(registryItems.removedAt)))
    .limit(1);

  const item = rows[0];
  if (!item) return ok(null);
  if (item.visibility === 'private' || item.visibility === 'connections') {
    if (item.ownerId !== actor.userId) return ok(null);
  }
  return ok(item as RegistryItemView);
}

export async function createRegistryItem(data: {
  title: string;
  description: string;
  details?: string;
}): Promise<ActionResult<{ id: string }>> {
  const actor = await signedInUser();
  if (!actor) return fail('Sign in to create a Registry entry.');

  const validated = validateFields(data);
  if (validated.error) return validated.error;
  const title = validated.title!;
  const description = validated.description!;
  const details = validated.details ?? '';
  const slug = `${slugBase(title).slice(0, 48)}-${randomHex(4)}`;

  await db.insert(registryItems).values({
    ownerId: actor.userId,
    slug,
    title,
    description,
    details,
    visibility: 'members',
  });

  revalidatePath('/registry');
  revalidatePath(`/registry/${slug}`);
  return ok({ id: slug });
}

export async function updateRegistryItem(
  slug: string,
  data: { title?: string; description?: string; details?: string },
): Promise<ActionResult<void>> {
  const actor = await signedInUser();
  if (!actor) return fail('Sign in to edit a Registry entry.');
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return fail('That Registry entry was not found.');

  const validated = validateFields(data);
  if (validated.error) return validated.error;

  const rows = await db
    .select({ id: registryItems.id, ownerId: registryItems.ownerId })
    .from(registryItems)
    .where(and(eq(registryItems.slug, slug), isNull(registryItems.removedAt)))
    .limit(1);
  const item = rows[0];
  if (!item) return fail('That Registry entry was not found.');
  if (item.ownerId !== actor.userId) return fail('Only the author can edit this entry.');

  const patch: Partial<typeof registryItems.$inferInsert> = { updatedAt: new Date() };
  if (validated.title !== undefined) patch.title = validated.title;
  if (validated.description !== undefined) patch.description = validated.description;
  if (validated.details !== undefined) patch.details = validated.details;

  await db.update(registryItems).set(patch).where(eq(registryItems.id, item.id));
  revalidatePath('/registry');
  revalidatePath(`/registry/${slug}`);
  return ok();
}

export async function deleteRegistryItem(slug: string): Promise<ActionResult<void>> {
  const actor = await signedInUser();
  if (!actor) return fail('Sign in to remove a Registry entry.');
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return fail('That Registry entry was not found.');

  const rows = await db
    .select({ id: registryItems.id, ownerId: registryItems.ownerId })
    .from(registryItems)
    .where(and(eq(registryItems.slug, slug), isNull(registryItems.removedAt)))
    .limit(1);
  const item = rows[0];
  if (!item) return fail('That Registry entry was not found.');
  if (item.ownerId !== actor.userId) return fail('Only the author can remove this entry.');

  await db
    .update(registryItems)
    .set({ removedAt: new Date(), updatedAt: new Date() })
    .where(eq(registryItems.id, item.id));
  revalidatePath('/registry');
  revalidatePath(`/registry/${slug}`);
  return ok();
}
