import Link from 'next/link';
import type { PostView } from '~/server/queries';
import { relativeTime, excerpt } from '~/lib/format';
import { Avatar } from '~/components/ui';
import { ReactionBar } from '~/components/commons/reaction-bar';
import { FollowButton } from './follow-button';

/** One network post, rendered the same way in the feed and on its own page. */
export function NetworkCard({ post, detail, viewerId, csrfToken, isFollowing }: { post: PostView; detail?: boolean; viewerId: string; csrfToken: string; isFollowing: boolean }) {
  return (
    <article className="post card">
      <header className="post-header">
        <Link href={`/network/${post.author.username}`} className="who">
          <Avatar
            displayName={post.author.displayName}
            avatarUrl={post.author.avatarUrl}
            size="sm"
            level={post.author.level}
          />
          <span className="who-text">
            <span className="who-name">{post.author.displayName}</span>
            <span className="who-handle">
              @{post.author.username} · {post.author.memberId}
            </span>
          </span>
        </Link>
        <div className="row row-2">
          {post.author.userId !== viewerId && <FollowButton targetUserId={post.author.userId} initialFollowing={isFollowing} csrfToken={csrfToken} />}
          <span className="post-meta">{relativeTime(post.createdAt)}</span>
        </div>
      </header>

      {post.body && (
        <div className="post-text">
          {detail ? (
            <p className="prose">{post.body}</p>
          ) : (
            <p>{excerpt(post.body, 460)}</p>
          )}
        </div>
      )}

      {post.attachments.length > 0 && (
        <div className="post-attachments">
          {post.attachments.map((attachment) => (
            <a
              key={attachment.fileId}
              className="post-attachment"
              href={`/files/${attachment.fileId}${attachment.kind === 'image' ? '' : '?download=1'}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="post-attachment-glyph" aria-hidden="true">
                {attachment.kind === 'image' ? '◉' : '⇄'}
              </span>
              <span className="post-attachment-name truncate">{attachment.displayName}</span>
            </a>
          ))}
        </div>
      )}

      {post.hashtags.length > 0 && (
        <div className="shared-tags">
          {post.hashtags.map((tag) => (
            <Link className="tag-link" href={`/network?tag=${encodeURIComponent(tag)}`} key={tag}>
              #{tag}
            </Link>
          ))}
        </div>
      )}

      <footer className="post-foot">
        <ReactionBar
          targetType="post"
          targetId={post.id}
          myReactions={post.myReactions}
          count={post.reactionCount}
        />
        <Link className="reaction-pill" href={`/network/${post.id}`}>
          <span aria-hidden="true">❝</span> Reply
        </Link>
        <span className="t-meta">
          {post.commentCount} comment{post.commentCount === 1 ? '' : 's'}
          {post.repostCount > 0 ? ` · ${post.repostCount} shares` : ''}
        </span>
      </footer>
    </article>
  );
}