'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '~db';
import { profiles, userSettings, users } from '~db/schema';
import { currentActor, can, revokeAllSessionsForUser, revokeSession } from '~/server/auth/session';
import { acquire } from '~/server/auth/rate-limit';
import { verifyCsrf } from '~/server/csrf';
import { writeAudit } from '~/server/security/audit';

/**
 * Deactivation is deliberately a reversible-by-support lifecycle state, not
 * an immediate destructive erase. It hides the account, blocks sign-in, and
 * revokes every session while preserving records needed for safety/legal
 * retention. A separately reviewed erasure workflow is still required.
 */
export async function deactivateAccount(formData: FormData): Promise<void> {
  await verifyCsrf(formData);
  const actor = await currentActor();
  if (!actor) redirect('/sign-in');
  if (!can(actor, 'read')) redirect('/settings/privacy?error=unavailable');

  if (formData.get('confirmation') !== 'DEACTIVATE') {
    redirect('/settings/privacy?error=confirmation');
  }

  const limiter = await acquire('write', actor.userId);
  if (!limiter.allowed) redirect('/settings/privacy?error=slow-down');

  const now = new Date();
  await writeAudit({ id: actor.userId, label: actor.memberIdLabel }, {
    action: 'account.deactivate',
    targetType: 'account',
    targetId: actor.userId,
    metadata: { initiatedByMember: true },
  });

  await db.transaction(async (tx) => {
    await tx.update(users)
      .set({ status: 'deactivated', removedAt: now, updatedAt: now })
      .where(eq(users.id, actor.userId));
    await tx.insert(userSettings)
      .values({
        userId: actor.userId,
        profileVisibility: 'private',
        discoverable: false,
        messagePolicy: 'nobody',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          profileVisibility: 'private',
          discoverable: false,
          messagePolicy: 'nobody',
          updatedAt: now,
        },
      });
    await tx.update(profiles)
      .set({ profileVisibility: 'private', updatedAt: now })
      .where(eq(profiles.userId, actor.userId));
  });

  await revokeAllSessionsForUser(actor.userId, 'account_deactivated');
  await revokeSession('account_deactivated');
  redirect('/sign-in?deactivated=1');
}
