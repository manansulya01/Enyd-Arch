export type StoryAudience = 'public' | 'followers' | 'mutuals';

export function mayViewStory(input: {
  viewerId: string;
  authorId: string;
  audience: StoryAudience;
  blocked: boolean;
  followsAuthor: boolean;
  followsViewer: boolean;
}): boolean {
  if (input.viewerId === input.authorId) return true;
  if (input.blocked) return false;
  if (input.audience === 'public') return true;
  if (!input.followsAuthor) return false;
  return input.audience === 'followers' || input.followsViewer;
}
