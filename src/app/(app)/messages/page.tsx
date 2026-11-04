import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { EmptyState, Tabs } from '~/components/ui';
import { ConversationList } from '~/components/messages/conversation-list';
import { MessageComposer } from '~/components/messages/message-composer';
import { GroupConversationComposer } from '~/components/messages/group-conversation-composer';
import { ConversationPoller } from '~/components/messages/conversation-poller';
import { ConversationReadMarker } from '~/components/messages/conversation-read-marker';
import { GroupInviteManager } from '~/components/messages/group-invite-manager';
import { MessageActions } from '~/components/messages/message-actions';
import { addGroupMember, toggleConversationMute, toggleMessagePin, toggleMessageReaction, leaveGroupConversation, removeGroupMember, renameGroupConversation, transferGroupOwnership } from '~/server/actions/messages';
import { conversationInvitesForOwner, conversationList, conversationMessages, matchesFor } from '~/server/queries';
import { sessionCsrfToken } from '~/server/csrf';
import { requireCapability } from '~/server/guard';
import { CsrfField } from '~/components/shell/csrf-field';

export const metadata: Metadata = { title: 'Messages' };

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; q?: string; reply?: string; updated?: string; ownership?: string; left?: string; memberRemoved?: string; memberAdded?: string; mute?: string; joined?: string; error?: string }>;
}) {
  const { actor } = await requireCapability('message');
  const [{ c, q, reply, updated, ownership, left, memberRemoved, memberAdded, mute, joined, error }, conversations, acceptedConnections, csrfToken] = await Promise.all([
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
  const messages = active ? await conversationMessages(active.id, actor.userId, q) : null;
  const activeInvites = active?.kind === 'group' && active.myRole === 'owner'
    ? await conversationInvitesForOwner(active.id, actor.userId)
    : [];
  const replyTarget = reply && messages ? messages.find((message) => message.id === reply && !message.removed) : undefined;

  return (
    <PageShell title="Messages" sub="Private, one-to-one, in small groups, and inside projects.">
      {updated === '1' && <p className="notice notice-success" role="status">Group details updated.</p>}
      {ownership === 'transferred' && <p className="notice notice-success" role="status">Group ownership was transferred.</p>}
      {left === '1' && <p className="notice notice-success" role="status">You left the group conversation.</p>}
      {memberRemoved === '1' && <p className="notice notice-success" role="status">The member was removed from this group.</p>}
      {memberAdded === '1' && <p className="notice notice-success" role="status">The member was added to this group.</p>}
      {mute === 'updated' && <p className="notice notice-success" role="status">Conversation notification mute updated.</p>}
      {joined === '1' && <p className="notice notice-success" role="status">You joined the group conversation.</p>}
      {error && <p className="notice notice-danger" role="alert">
        {error === 'transfer-first'
          ? 'Transfer ownership to another group member before leaving.'
          : error === 'slow-down'
            ? 'Please wait before making another conversation change.'
            : error === 'group-full'
              ? 'This group has reached its 12-member limit.'
              : error === 'already-member'
                ? 'That member is already in this group.'
                : error === 'invite-unavailable'
                  ? 'That member is not available to invite.'
            : 'That conversation change could not be completed.'}
      </p>}
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
          {active && (
            <form action={toggleConversationMute} className="panel-head row row-between">
              <input type="hidden" name="__csrf" value={csrfToken} />
              <input type="hidden" name="conversationId" value={active.id} />
              <span className="t-meta">{active.mutedUntil && active.mutedUntil > new Date() ? 'Muted for this conversation' : 'Conversation notifications on'}</span>
              <button className="btn btn-ghost btn-sm" type="submit">{active.mutedUntil && active.mutedUntil > new Date() ? 'Unmute' : 'Mute for 8 hours'}</button>
            </form>
          )}

          <div className="panel-body panel-body-flush">
            {!active || !messages ? (
              <EmptyState
                glyph="✉"
                title="No conversation selected."
                body="Choose one from the list, or start a new conversation from someone's profile."
              />
            ) : (
              <>
                {active.kind === 'group' && active.myRole === 'owner' && (
                  <section className="panel-body stack stack-3" aria-label="Group settings">
                    <form action={renameGroupConversation} className="row row-wrap">
                      <input type="hidden" name="__csrf" value={csrfToken} />
                      <input type="hidden" name="conversationId" value={active.id} />
                      <label className="field" style={{ flex: 1 }}>
                        <span className="field-label">Group name</span>
                        <input className="input" name="title" defaultValue={active.title} maxLength={120} minLength={2} required />
                      </label>
                      <button className="btn btn-secondary" type="submit">Rename group</button>
                    </form>
                    {active.members.length < 12 && contacts.some(contact => !active.members.some(member => member.userId === contact.userId)) && (
                      <form action={addGroupMember} className="row row-wrap">
                        <input type="hidden" name="__csrf" value={csrfToken} />
                        <input type="hidden" name="conversationId" value={active.id} />
                        <label className="field" style={{ flex: 1 }}>
                          <span className="field-label">Add a connection</span>
                          <select className="input" name="targetUserId" defaultValue="" required>
                            <option value="" disabled>Select a member</option>
                            {contacts.filter(contact => !active.members.some(member => member.userId === contact.userId)).map(contact => (
                              <option key={contact.userId} value={contact.userId}>{contact.displayName} (@{contact.username})</option>
                            ))}
                          </select>
                        </label>
                        <button className="btn btn-secondary" type="submit">Add member</button>
                      </form>
                    )}
                    {active.members.some(member => member.userId !== actor.userId) && (
                      <form action={transferGroupOwnership} className="stack stack-2">
                        <input type="hidden" name="__csrf" value={csrfToken} />
                        <input type="hidden" name="conversationId" value={active.id} />
                        <label className="field">
                          <span className="field-label">Transfer ownership to</span>
                          <select className="input" name="targetUserId" defaultValue="" required>
                            <option value="" disabled>Select a current member</option>
                            {active.members.filter(member => member.userId !== actor.userId).map(member => (
                              <option key={member.userId} value={member.userId}>{member.displayName} (@{member.username})</option>
                            ))}
                          </select>
                        </label>
                        <label className="check-row">
                          <input type="checkbox" name="confirmTransfer" required />
                          <span>I understand the selected member will become the group owner.</span>
                        </label>
                        <button className="btn btn-secondary" type="submit">Transfer ownership</button>
                      </form>
                    )}
                    {active.members.filter(member => member.userId !== actor.userId).map(member => (
                      <form action={removeGroupMember} className="row row-wrap" key={member.userId}>
                        <input type="hidden" name="__csrf" value={csrfToken} />
                        <input type="hidden" name="conversationId" value={active.id} />
                        <input type="hidden" name="targetUserId" value={member.userId} />
                        <span className="t-small">{member.displayName} (@{member.username})</span>
                        <label className="check-row">
                          <input type="checkbox" name="confirmRemove" required />
                          <span>Confirm removal</span>
                        </label>
                        <button className="btn btn-ghost btn-sm" type="submit">Remove member</button>
                      </form>
                    ))}
                  </section>
                )}
                {active.kind === 'group' && (active.myRole !== 'owner' || active.members.every(member => member.userId === actor.userId)) && (
                  <form action={leaveGroupConversation} className="panel-body row row-wrap">
                    <input type="hidden" name="__csrf" value={csrfToken} />
                    <input type="hidden" name="conversationId" value={active.id} />
                    <label className="check-row">
                      <input type="checkbox" name="confirmLeave" required />
                      <span>Confirm leaving this group conversation</span>
                    </label>
                    <button className="btn btn-ghost btn-sm" type="submit">Leave group</button>
                  </form>
                )}
                {active.kind === 'group' && active.myRole === 'owner' && (
                  <GroupInviteManager conversationId={active.id} csrfToken={csrfToken} initialInvites={activeInvites} />
                )}
                <form method="get" action="/messages" className="panel-body row row-wrap" role="search" aria-label="Search messages">
                  <input type="hidden" name="c" value={active.id} />
                  <label className="field" style={{ flex: 1 }}>
                    <span className="field-label">Search this conversation</span>
                    <input className="input" type="search" name="q" defaultValue={q ?? ''} maxLength={80} placeholder="Find a message…" />
                  </label>
                  <button className="btn btn-secondary" type="submit">Search</button>
                  {q && <Link className="btn btn-ghost" href={`/messages?c=${active.id}`}>Clear</Link>}
                </form>
                <ConversationPoller conversationId={active.id} />
                <ConversationReadMarker conversationId={active.id} csrfToken={csrfToken} />
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
                        {message.replyTo && (
                          <blockquote className="bubble-reply">
                            <span className="bubble-meta">Replying to an earlier message</span>
                            <p className="t-small">{message.replyTo.preview}</p>
                          </blockquote>
                        )}
                        {message.attachment && (
                          <div className="stack stack-2">
                            {/^image\/(png|jpeg|gif|webp|avif|bmp)$/i.test(message.attachment.contentType) && (
                              // File route performs the same membership and block checks as the download.
                              <a href={`/files/${message.attachment.id}`} aria-label={`Open image: ${message.attachment.displayName}`}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={`/files/${message.attachment.id}`}
                                  alt={message.attachment.displayName}
                                  loading="lazy"
                                  style={{ display: 'block', maxWidth: 'min(100%, 480px)', maxHeight: 360, objectFit: 'contain', borderRadius: 'var(--radius-md)' }}
                                />
                              </a>
                            )}
                            {message.attachment.contentType.startsWith('audio/') && (
                              <audio controls preload="none" src={`/files/${message.attachment.id}`}>
                                Your browser cannot play this audio file.
                              </audio>
                            )}
                            {message.attachment.contentType.startsWith('video/') && (
                              <video controls preload="metadata" playsInline src={`/files/${message.attachment.id}`} style={{ display: 'block', maxWidth: 'min(100%, 560px)', maxHeight: 360, borderRadius: 'var(--radius-md)' }}>
                                Your browser cannot play this video file.
                              </video>
                            )}
                            <a className="post-attachment" href={`/files/${message.attachment.id}?download=1`}>
                              <span className="post-attachment-glyph" aria-hidden="true">⇄</span>
                              {message.attachment.displayName}
                              <span className="t-meta"> · {Math.max(1, Math.round(message.attachment.byteSize / 1024))} KB</span>
                            </a>
                          </div>
                        )}
                        {!message.removed && (
                          <form action={toggleMessagePin} className="row row-wrap">
                            <input type="hidden" name="__csrf" value={csrfToken} />
                            <input type="hidden" name="messageId" value={message.id} />
                            <button className="btn btn-ghost btn-sm" type="submit" aria-label={message.pinnedAt ? 'Unpin message' : 'Pin message'}>
                              {message.pinnedAt ? '📌 Pinned · Unpin' : 'Pin message'}
                            </button>
                          </form>
                        )}
                        {!message.removed && (
                          <div className="row row-wrap" aria-label="Message reactions">
                            {message.reactions.map((reaction) => (
                              <form action={toggleMessageReaction} key={reaction.emoji}>
                                <input type="hidden" name="__csrf" value={csrfToken} />
                                <input type="hidden" name="messageId" value={message.id} />
                                <input type="hidden" name="emoji" value={reaction.emoji} />
                                <button className={reaction.reactedByMe ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} type="submit" aria-pressed={reaction.reactedByMe}>
                                  {reaction.emoji} {reaction.count}
                                </button>
                              </form>
                            ))}
                            {(['👍', '❤️', '😂', '🎉', '👀', '🙏'] as const).filter((emoji) => !message.reactions.some((reaction) => reaction.emoji === emoji)).map((emoji) => (
                              <form action={toggleMessageReaction} key={emoji}>
                                <input type="hidden" name="__csrf" value={csrfToken} />
                                <input type="hidden" name="messageId" value={message.id} />
                                <input type="hidden" name="emoji" value={emoji} />
                                <button className="btn btn-ghost btn-sm" type="submit" aria-label={`React with ${emoji}`}>{emoji}</button>
                              </form>
                            ))}
                          </div>
                        )}
                        <span className="bubble-meta">
                          {new Date(message.createdAt).toISOString().slice(11, 16)} UTC
                          {message.isMine ? ' · sent' : ''}
                          {message.editedAt ? ' · edited' : ''}{message.pinnedAt ? ' · pinned' : ''}
                          {message.isMine && message.seenBy.length > 0 ? ` · Seen by ${message.seenBy.join(', ')}` : ''}
                        </span>
                        {!message.removed && (
                          <p className="bubble-meta">
                            <Link href={`/messages?c=${active.id}&reply=${message.id}`}>Reply</Link>
                          </p>
                        )}
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
                  <MessageComposer
                    key={active.id}
                    conversationId={active.id}
                    csrf={<CsrfField />}
                    replyToId={replyTarget?.id}
                    replyPreview={replyTarget ? (replyTarget.body || (replyTarget.attachment ? 'Attachment' : 'Message')) : undefined}
                  />
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

