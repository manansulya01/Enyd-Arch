'use server';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '~db';
import { governanceProposals, governanceVotes, innerArchMembers } from '~db/schema';
import { fail, ok, type ActionResult } from '~/lib/action-result';
import { currentActor } from '~/server/auth/session';
import { verifyCsrfValue } from '~/server/csrf';

export async function castGovernanceVote(
  proposalId: string,
  value: 1 | -1,
  note: string,
  csrf: string,
): Promise<ActionResult> {
  await verifyCsrfValue(csrf);
  const actor = await currentActor();
  if (!actor) return fail('Sign in to vote.');
  if (!/^[0-9a-f-]{36}$/i.test(proposalId) || (value !== 1 && value !== -1)) {
    return fail('That vote is not valid.');
  }

  const [membership] = await db.select({ userId: innerArchMembers.userId })
    .from(innerArchMembers)
    .where(and(eq(innerArchMembers.userId, actor.userId), isNull(innerArchMembers.removedAt)))
    .limit(1);
  if (!membership) return fail('Only active Inner Arch members can vote.');

  try {
    await db.transaction(async (tx) => {
      const [proposal] = await tx.select({
        id: governanceProposals.id,
        result: governanceProposals.result,
        opensAt: governanceProposals.opensAt,
        closesAt: governanceProposals.closesAt,
      }).from(governanceProposals)
        .where(eq(governanceProposals.id, proposalId))
        .for('update')
        .limit(1);
      const now = new Date();
      if (!proposal || proposal.result !== 'open' || proposal.opensAt > now || proposal.closesAt <= now) {
        throw new Error('Voting is closed for this proposal.');
      }

      const [existing] = await tx.select({
        value: governanceVotes.value,
      }).from(governanceVotes)
        .where(and(eq(governanceVotes.proposalId, proposalId), eq(governanceVotes.userId, actor.userId)))
        .limit(1);

      const cleanNote = note.trim().slice(0, 1000) || null;
      if (existing?.value === value) {
        await tx.update(governanceVotes).set({ note: cleanNote })
          .where(and(eq(governanceVotes.proposalId, proposalId), eq(governanceVotes.userId, actor.userId)));
        return;
      }

      if (existing) {
        await tx.update(governanceVotes).set({ value, note: cleanNote })
          .where(and(eq(governanceVotes.proposalId, proposalId), eq(governanceVotes.userId, actor.userId)));
      } else {
        await tx.insert(governanceVotes).values({ proposalId, userId: actor.userId, value, note: cleanNote });
      }

      await tx.update(governanceProposals).set({
        upvoterCount: sql`${governanceProposals.upvoterCount} + ${value === 1 ? 1 : 0} - ${existing?.value === 1 ? 1 : 0}`,
        downvoterCount: sql`${governanceProposals.downvoterCount} + ${value === -1 ? 1 : 0} - ${existing?.value === -1 ? 1 : 0}`,
      }).where(eq(governanceProposals.id, proposalId));
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Could not record your vote.');
  }

  revalidatePath('/inner-arch');
  return ok();
}
