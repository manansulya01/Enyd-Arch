import type { ReactNode } from 'react';

/**
 * The standard page frame: a sticky header with a title, optional search and
 * actions, and the content column beneath it. Using it everywhere keeps the
 * vertical rhythm identical across every area of the Arch.
 */
export function PageShell({
  title,
  sub,
  actions,
  children,
  wide,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-title">
          <h1 className="topbar-heading">{title}</h1>
          {sub && <span className="topbar-sub">{sub}</span>}
        </div>
        <div className="topbar-actions">
          <form className="topbar-search" action="/search" method="get" role="search">
            <label className="sr-only" htmlFor="global-search">
              Search the Arch
            </label>
            <input
              id="global-search"
              className="input input-search"
              type="search"
              name="q"
              placeholder="Search the Arch…"
              autoComplete="off"
            />
          </form>
          {actions}
        </div>
      </header>
      <main className={wide ? 'page' : 'page page-narrow'} id="main">
        {children}
      </main>
    </>
  );
}
