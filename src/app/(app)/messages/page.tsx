import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState, Tabs } from '~/components/ui';
import { ConversationList } from '~/components/messages/conversation-list';
import { MessageComposer } from '~/components/messages/message-composer';
import { GroupConversationComposer } from '~/components/messages/group-conversation-composer';
import { ConversationPoller } from '~/components/messages/conversation-poller';
import { MessageActions } from '~/components/messages/message-actions';
import { conversationList, conversationMessages, matchesFor } from '~/server/queries';
import { sessionCsrfToken } from '~/server/csrf';
import { requireCapability } from '~/server/guard';
import { CsrfField } from '~/components/shell/csrf-field';

export const metadata: Metadata = { title: 'Messages' };

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { actor } = await requireCapability('message');
  const [{ c }, conversations, acceptedConnections, csrfToken] = await Promise.all([
    searchParams,
    conversationList(actor.userId),
    matchesFor(actor.userId, 'accepted'),
    sessionCsrfToken(),
  ]);
  const contacts = [...new Map(acceptedConnections.map((match) => [match.partner.userId, {
    userId: match.partner.userId,
    username: match.partner.username,
    displayName: match.partner.displayName,
  }])).values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  const active = c ? conversations.find((conversation) => conversation.id === c) : undefined;
  const messages = active ? await conversationMessages(active.id, actor.userId) : null;

  return (
    <PageShell title="Messages" sub="Private, one-to-one, in small groups, and inside projects.">
      <div className="messages-layout">
        <section className="panel" aria-label="Conversations">
          <div className="panel-head">
            <span className="t-label">Conversations</span>
          </div>
          <div className="panel-body panel-body-flush">
            {conversations.length === 0 ? (
              <div className="card-pad">
                <p className="t-small t-subtle">
                  No conversations yet. Open a member's profile and write to them, or join a project.
                </p>
              </div>
            ) : (
              <ConversationList conversations={conversations} activeId={active?.id ?? null} />
            )}
            <div className="card-pad">
              <GroupConversationComposer contacts={contacts} csrfToken={csrfToken} />
            </div>
          </div>
        </section>

        <section className="panel thread" aria-label="Thread">
          <div className="panel-head thread-head">
            {active ? (
              <>
                <span className="t-label truncate">{active.title}</span>
                <span className="t-meta">{active.memberCount} members</span>
              </>
            ) : (
              <span className="t-label">Select a conversation</span>
            )}
          </div>

          <div className="panel-body panel-body-flush">
            {!active || !messages ? (
              <EmptyState
                glyph="✉"
                title="No conversation selected."
                body="Choose one from the list, or start a new conversation from someone's profile."
              />
            ) : (
              <>
                <ConversationPoller conversationId={active.id} />
                <div className="thread-scroll">
                  {messages.length === 0 ? (
                    <p className="t-small t-subtle card-pad">
                      Nothing sent yet. Messages in Enyd Arch are private to the members of the
                      conversation.
                    </p>
                  ) : (
                    messages.map((message) => (
                      <div className={`bubble${message.isMine ? ' is-mine' : ''}`} key={message.id}>
                        {!message.isMine && (
                          <span className="bubble-meta">
                            {message.sender.displayName} · @{message.sender.username}
                          </span>
                        )}
                        {message.removed ? (
                          <p className="bubble-text t-muted">
                            <em>This message was removed.</em>
                          </p>
                        ) : (
                          <p className="bubble-text">{message.body}</p>
                        )}
                        {message.attachment && (
                          <a className="post-attachment" href={`/files/${message.attachment.id}?download=1`}>
                            <span className="post-attachment-glyph" aria-hidden="true">
                              ⇄
                            </span>
                            {message.attachment.displayName}
                          </a>
                        )}
                        <span className="bubble-meta">
                          {new Date(message.createdAt).toISOString().slice(11, 16)} UTC
                          {message.isMine ? ' · sent' : ''}
                          {message.editedAt ? ' · edited' : ''}
                        </span>
                        {message.isMine && !message.removed && (
                          <MessageActions
                            messageId={message.id}
                            body={message.body}
                            csrfToken={csrfToken}
                            canEdit={Boolean(message.body) && Date.now() - new Date(message.createdAt).getTime() < 15 * 60 * 1000}
                          />
                        )}
                      </div>
                    ))
                  )}
                </div>
                <div className="thread-composer">
                  <MessageComposer conversationId={active.id} csrf={<CsrfField />} />
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <nav className="side-nav" aria-label="Messaging shortcuts" style={{ marginTop: 'var(--sp-6)' }}>
        <Link href="/connections">Connections</Link>
        <Link href="/projects">Project rooms</Link>
        <Link href="/network">The Network</Link>
      </nav>
    </PageShell>
  );
}

