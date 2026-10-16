import Link from 'next/link';
import { COPY, MARK, PRODUCT_NAME, TAGLINE } from '~/lib/domain';

/**
 * The landing page.
 *
 * Its job is to establish that Enyd Arch is not another social feed, then get
 * someone through the door. It is deliberately light: no navigation beyond the
 * two things a visitor can do, and no product tour. The feeling of the place
 * has to come from the writing.
 */

const AREA_PREVIEW = [
  { glyph: '❝', name: 'The Commons', blurb: 'Conversation without an algorithm in the way.' },
  { glyph: '▤', name: 'The Archive', blurb: 'Everything interesting eventually finds its way here.' },
  { glyph: '◱', name: 'The Arcade', blurb: 'Small games built by the people who play them.' },
  { glyph: '◇', name: 'Connections', blurb: 'Friends, collaborators, maybe something more.' },
  { glyph: '⌘', name: 'Projects', blurb: 'Rooms where something actually gets finished.' },
  { glyph: '✦', name: 'The Chronicle', blurb: 'The record of what this place has been.' },
];

const PROMISES = [
  {
    glyph: '◈',
    title: 'Discovery, not a feed',
    body: 'Nothing here is ranked to keep you scrolling. There is no next page of strangers. You look for things, and you stop when you have what you came for.',
  },
  {
    glyph: '◉',
    title: 'Private by design',
    body: 'Your public identity is your Enyd identity — a handle, a display name, and a membership number. Not your address, not your email, not your phone.',
  },
  {
    glyph: '❖',
    title: 'Built by its members',
    body: 'Games, writing, music, tools, collections. The Archive fills up because people put things in it, and it stays legible because someone is looking after it.',
  },
  {
    glyph: '◇',
    title: 'One identity, one device',
    body: 'Your membership is associated with a single trusted device. It keeps accounts personal and makes it far harder for someone to pass yours around.',
  },
];

export default function LandingPage() {
  return (
    <div className="landing">
      <main className="landing-main" id="main">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="hero">
          <div className="hero-inner">
            <p className="hero-eyebrow">{COPY.landing.eyebrow}</p>
            <span className="hero-mark" aria-hidden="true">
              {MARK}
            </span>
            <h1 className="hero-title">{COPY.landing.headline}</h1>

            <div className="hero-lines">
              {COPY.landing.lines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>

            <p className="hero-whisper">{COPY.landing.whisper}</p>

            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg btn-mark" href="/register">
                {COPY.landing.cta}
              </Link>
              <Link className="btn btn-ghost btn-lg" href="/sign-in">
                I already have an identity
              </Link>
            </div>

            <p className="hero-note">
              {PRODUCT_NAME} is invitation-led and built for students. Joining means
              choosing a device to belong to and keeping it.
            </p>
          </div>
        </section>

        {/* ── What is inside ───────────────────────────────────────────── */}
        <section className="areas-band" aria-labelledby="areas-heading">
          <h2 id="areas-heading" className="sr-only">
            Areas of the Arch
          </h2>
          <div className="areas-grid">
            {AREA_PREVIEW.map((area) => (
              <div className="area-tile" key={area.name}>
                <span className="area-glyph" aria-hidden="true">
                  {area.glyph}
                </span>
                <span className="area-name">{area.name}</span>
                <span className="area-blurb">{area.blurb}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── What it is like ──────────────────────────────────────────── */}
        <section className="promise-band" aria-labelledby="promise-heading">
          <h2 id="promise-heading" className="sr-only">
            What to expect
          </h2>
          {PROMISES.map((promise) => (
            <div className="promise" key={promise.title}>
              <span className="promise-glyph" aria-hidden="true">
                {promise.glyph}
              </span>
              <h3 className="promise-title">{promise.title}</h3>
              <p className="promise-body">{promise.body}</p>
            </div>
          ))}
        </section>

        {/* ── Archive copy ─────────────────────────────────────────────── */}
        <section className="areas-band" aria-labelledby="archive-heading">
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-4)',
              alignItems: 'center',
              textAlign: 'center',
              padding: 'clamp(var(--sp-12), 8vh, var(--sp-20)) var(--sp-6)',
            }}
          >
            <span className="t-eyebrow">The Archive</span>
            <h2
              id="archive-heading"
              className="t-display"
              style={{ maxWidth: '20ch' }}
            >
              {COPY.archive.headline}
            </h2>
            <p className="t-lede" style={{ textAlign: 'center' }}>
              {COPY.archive.body}
            </p>
            <Link className="btn btn-secondary" href="/register">
              {COPY.archive.cta}
            </Link>
          </div>
        </section>

        {/* ── Final call ───────────────────────────────────────────────── */}
        <section className="hero" style={{ paddingTop: 'clamp(var(--sp-12), 8vh, var(--sp-20))' }}>
          <div className="hero-inner">
            <span className="hero-mark" aria-hidden="true">
              {MARK}
            </span>
            <p className="hero-whisper" style={{ fontSize: 'var(--fs-xl)' }}>
              {TAGLINE}
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-lg btn-mark" href="/register">
                {COPY.landing.cta}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <p>
          {MARK} {PRODUCT_NAME} — {TAGLINE}
        </p>
        <nav aria-label="Footer">
          <Link href="/sign-in">Sign in</Link>
          <Link href="/register">Request an invitation</Link>
          <Link href="/about">About this place</Link>
          <Link href="/safety">Safety</Link>
          <Link href="/privacy">Private by design</Link>
        </nav>
      </footer>
    </div>
  );
}