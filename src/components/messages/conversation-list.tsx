import Link from 'next/link';
import { relativeTime } from '~/lib/format';
import { Avatar } from '~/components/ui';
import type { ConversationSummary } from '~/server/queries';

const KIND_GLYPH: Record<string, string> = {
  direct: '✉',
  group: '◈',
  project: '⌘',
};

/** The conversation rail. Unread state is resolved server-side. */
export function ConversationList({
  conversations,
  activeId,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
}) {
  return (
    <ul className="conversation-list">
      {conversations.map((conversation) => {
        const others = conversation.members.filter((member) => member.userId);
        const lead = others[0];
        return (
          <li key={conversation.id}>
            <Link
              className="conversation-item"
              href={`/messages?c=${conversation.id}`}
              aria-current={conversation.id === activeId ? 'page' : undefined}
            >
              <span className="act-glyph" aria-hidden="true">
                {KIND_GLYPH[conversation.kind] ?? '✉'}
              </span>
              <span className="conversation-item-body">
                <span className="row row-between">
                  <span className="conversation-item-title truncate">{conversation.title}</span>
                  {conversation.unread > 0 && (
                    <span className="nav-count nav-count-accent">{conversation.unread}</span>
                  )}
                </span>
                <span className="conversation-item-preview truncate">
                  {conversation.lastMessagePreview ?? 'No messages yet'}
                </span>
                {conversation.lastMessageAt && (
                  <span className="t-meta">
                    {relativeTime(conversation.lastMessageAt)}
                    {lead ? ` · ${conversation.memberCount} members` : ''}
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export { Avatar };
