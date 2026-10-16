import { NextRequest, NextResponse } from 'next/server';

/**
 * Anonymous forms need a double-submit CSRF cookie before Server Components
 * render their hidden token field. Server Components cannot mutate cookies, so
 * middleware creates the cookie and forwards it on the current request.
 */
export function middleware(request: NextRequest) {
  if (request.cookies.has('enyd_session') || request.cookies.has('enyd_csrf')) {
    return NextResponse.next();
  }

  const token = crypto.randomUUID().replace(/-/g, '');
  request.cookies.set('enyd_csrf', token);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    'cookie',
    request.cookies.getAll().map(({ name, value }) => `${name}=${value}`).join('; '),
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set('enyd_csrf', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 4,
  });
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|mark.svg|robots.txt).*)'],
};
