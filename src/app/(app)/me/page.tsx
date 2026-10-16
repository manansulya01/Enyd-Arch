import { redirect } from 'next/navigation';
import { requireOnboarded } from '~/server/guard';

export default async function MePage() {
  const { actor } = await requireOnboarded();
  redirect(`/profile/${actor.username}`);
}
