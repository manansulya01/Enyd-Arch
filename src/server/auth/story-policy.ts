export type StoryAudience = 'public' | 'followers';

export function mayViewStory(input: {
  viewerId: string;
  authorId: string;
  audience: StoryAudience;
  blocked: boolean;
  followsAuthor: boolean;
}): boolean {
  if (input.viewerId === input.authorId) return true;
  if (input.blocked) return false;
  if (input.audience === 'public') return true;
  return input.followsAuthor;
}
