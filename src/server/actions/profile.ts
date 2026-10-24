'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '~db';
import { profiles } from '~db/schema';
import { fail } from '~/lib/action-result';
import { currentActor, can } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrf } from '~/server/csrf';

function textField(formData: FormData, name: string, maxLength: number): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function parseSkills(value: string): Array<{ key: string; label: string }> {
  const seen = new Set<string>();
  return value.split('\n').map((line) => line.trim().slice(0, 64)).filter(Boolean).slice(0, 30)
    .flatMap((label) => {
      const key = label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
      if (!key || seen.has(key)) return [];
      seen.add(key);
      return [{ key, label }];
    });
}

function parseLinks(value: string): Array<{ label: string; url: string }> | null {
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 12);
  const links: Array<{ label: string; url: string }> = [];
  for (const line of lines) {
    const separator = line.indexOf('|');
    if (separator < 1) return null;
    const label = line.slice(0, separator).trim().slice(0, 80);
    const rawUrl = line.slice(separator + 1).trim().slice(0, 2048);
    if (!label || !rawUrl) return null;
    try {
      const url = new URL(rawUrl);
      if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return null;
      links.push({ label, url: url.toString() });
    } catch {
      return null;
    }
  }
  return links;
}

export async function saveProfileDetails(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'read')) redirect('/settings/profile?error=unavailable');

  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) redirect('/settings/profile?error=slow-down');

  const headline = textField(formData, 'headline', 120);
  const bio = textField(formData, 'bio', 2000);
  const pronouns = textField(formData, 'pronouns', 24);
  const institution = textField(formData, 'institution', 120);
  const fieldOfStudy = textField(formData, 'fieldOfStudy', 120);
  const skills = parseSkills(textField(formData, 'skills', 4000));
  const links = parseLinks(textField(formData, 'links', 12000));
  if (!links) redirect('/settings/profile?error=invalid-links');

  const values = {
    headline: headline || null,
    bio: bio || null,
    pronouns: pronouns || null,
    institution: institution || null,
    fieldOfStudy: fieldOfStudy || null,
    skills,
    links,
    updatedAt: new Date(),
  };

  await db.insert(profiles)
    .values({ userId: actor.userId, ...values })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: values,
    });

  revalidatePath('/settings/profile');
  revalidatePath('/members/' + actor.username);
  revalidatePath('/registry');
  redirect('/settings/profile?saved=1');
}
