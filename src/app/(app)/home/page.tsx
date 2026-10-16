import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '~/components/ui/page-shell';
import { Avatar, EmptyState, Stat } from '~/components/ui';
import { PostCard } from '~/components/commons/post-card';
import { requireOnboarded } from '~/server/guard';
import {
  archiveObjects,
  conversationList,
  events,
  feed,
  galleryPosts,
  matchesFor,
  memberByUsername,
  notificationList,
  projectList,
} from '~/server/queries';
import { countdown, relativeTime, excerpt } from '~/lib/format';
import { CONNECTION_MODES } from '~/lib/domain';

export const metadata: Metadata = { title: 'Your Arch' };

function greeting(now = new Date()): string {
  const hour = now.getUTCHours();
  if (hour < 5) return 'Still awake';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default async function HomePage() {
  const { actor } = await requireOnboarded();

  const [posts, objects, upcoming, art, conversations, projects, connections, notices, neighbours] =
    await Promise.all([
      feed({ viewerId: actor.userId, sort: 'active', limit: 6 }),
      archiveObjects({ viewerId: actor.userId, sort: 'recent', limit: 4 }),
      events({ viewerId: actor.userId, limit: 3 }),
      galleryPosts({ viewerId: actor.userId, limit: 4 }),
      conversationList(actor.userId),
      projectList(actor.userId, 4),
      matchesFor(actor.userId, 'accepted'),
      notificationList(actor.userId, { limit: 5 }),
      // People with shared interests, resolved from the seed catalogue.
      memberByUsername('mira', actor.userId).catch(() => null),
    ]);

  const unreadMessages = conversations.reduce((total, conversation) => total + conversation.unread, 0);

  return (
    <PageShell
      title={`${greeting()}, ${actor.displayName.split(' ')[0]}`}
      sub="Your Arch — where things are, and what has moved since you were here."
    >
      <div className="dashboard-grid">
        {/* ── Your Arch ─────────────────────────────────────────────── */}
        <section className="panel" aria-labelledby="your-arch">
          <div className="panel-head">
            <span className="t-label" id="your-arch">
              Your Arch
            </span>
          </div>
          <div className="panel-body">
            <div className="stat-strip">
              <Stat label="unread messages" value={unreadMessages} />
              <Stat label="connections" value={connections.length} />
              <Stat label="active projects" value={projects.length} />
              <Stat label="events ahead" value={upcoming.length} />
            </div>
          </div>
          <div className="panel-body row row-wrap">
            <Link className="btn btn-ghost btn-sm" href="/messages">
              Messages
            </Link>
            <Link className="btn btn-ghost btn-sm" href="/connections">
              Connections
            </Link>
            <Link className="btn btn-ghost btn-sm" href="/projects">
              Projects
            </Link>
            <Link className="btn btn-ghost btn-sm" href="/events">
              Events
            </Link>
          </div>
        </section>

        {/* ── Recently discovered ────────────────────────────────────── */}
        <section className="panel" aria-labelledby="discovered">
          <div className="panel-head">
            <span className="t-label" id="discovered">
              Recently discovered
            </span>
            <Link className="lnk" href="/archive">
              The Archive →
            </Link>
          </div>
          <div className="panel-body stack stack-3">
            {objects.length === 0 ? (
              <p className="t-small t-subtle">
                The Archive is quiet. Anything you put in it shows up here for everyone.
              </p>
            ) : (
              objects.map((object) => (
                <Link className="row row-between" href={`/archive/${object.slug}`} key={object.id}>
                  <span className="truncate">
                    <span className="mono t-meta">{object.catalogueNumber}</span> {object.title}
                  </span>
                  <span className="t-meta">{relativeTime(object.createdAt)}</span>
                </Link>
              ))
            )}

            {art.length > 0 && (
              <>
                <span className="t-label">In the Gallery</span>
                {art.map((piece) => (
                  <Link className="row row-between" href={`/gallery/${piece.slug}`} key={piece.id}>
                    <span className="truncate">{piece.title}</span>
                    <span className="t-meta">by {piece.author.displayName}</span>
                  </Link>
                ))}
              </>
            )}
          </div>
        </section>

        {/* ── Events ─────────────────────────────────────────────────── */}
        <section className="panel" aria-labelledby="events">
          <div className="panel-head">
            <span className="t-label" id="events">
              Events
            </span>
            <Link className="lnk" href="/events">
              All events →
            </Link>
          </div>
          <div className="panel-body stack stack-3">
            {upcoming.length === 0 ? (
              <p className="t-small t-subtle">Nothing on the calendar. Start something.</p>
            ) : (
              upcoming.map((event) => (
                <Link className="row row-between" href={`/events/${event.slug}`} key={event.id}>
                  <span className="truncate">{event.title}</span>
                  <span className="t-meta">{countdown(event.startsAt)}</span>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* ── People ─────────────────────────────────────────────────── */}
        <section className="panel" aria-labelledby="people">
          <div className="panel-head">
            <span className="t-label" id="people">
              People
            </span>
            <Link className="lnk" href="/network">
              The Network →
            </Link>
          </div>
          <div className="panel-body stack stack-3">
            {connections.length === 0 && !neighbours ? (
              <p className="t-small t-subtle">
                No connections yet. Connections is opt-in and separate from everything else.
              </p>
            ) : (
              connections.slice(0, 4).map((match) => (
                <Link className="row row-4" href={`/network/${match.partner.username}`} key={match.id}>
                  <Avatar
                    displayName={match.partner.displayName}
                    avatarUrl={match.partner.avatarUrl}
                    size="xs"
                  />
                  <span className="truncate">{match.partner.displayName}</span>
                  <span className="t-meta">
                    {CONNECTION_MODES.find((mode) => mode.value === match.mode)?.label ?? match.mode}
                  </span>
                </Link>
              ))
            )}
            {neighbours && (
              <Link className="row row-4" href={`/network/${neighbours.username}`}>
                <Avatar displayName={neighbours.displayName} avatarUrl={neighbours.avatarUrl} size="xs" />
                <span className="truncate">{neighbours.displayName}</span>
                <span className="t-meta">{neighbours.headline ?? 'Member'}</span>
              </Link>
            )}
          </div>
        </section>

        {/* ── Notices ────────────────────────────────────────────────── */}
        <section className="panel" aria-labelledby="notices">
          <div className="panel-head">
            <span className="t-label" id="notices">
              Your activity
            </span>
            <Link className="lnk" href="/notifications">
              Notifications →
            </Link>
          </div>
          <div className="panel-body stack stack-2">
            {notices.length === 0 ? (
              <p className="t-small t-subtle">Nothing new.</p>
            ) : (
              notices.map((notice) => (
                <div className="row row-between" key={notice.id}>
                  <span className="truncate t-small">
                    {notice.href ? (
                      <Link href={notice.href}>{notice.title}</Link>
                    ) : (
                      notice.title
                    )}
                  </span>
                  <span className="t-meta">{relativeTime(notice.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ── The Commons ────────────────────────────────────────────── */}
        <section className="stack stack-4" aria-labelledby="commons">
          <div className="row row-between">
            <h2 className="t-section" id="commons">
              In the Commons
            </h2>
            <Link className="lnk" href="/commons">
              Open the Commons →
            </Link>
          </div>

          {posts.length === 0 ? (
            <EmptyState
              glyph="❝"
              title="Nothing has been said yet."
              body="The Commons is the first thing most people open. Start it."
            />
          ) : (
            posts.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </section>
      </div>
    </PageShell>
  );
}

