import { redirect } from 'next/navigation';
import { requireOnboarded } from '~/server/guard';

export default async function MePage(): Promise<never> {
  const { actor } = await requireOnboarded();
  redirect(`/members/${encodeURIComponent(actor.username)}`);
}
