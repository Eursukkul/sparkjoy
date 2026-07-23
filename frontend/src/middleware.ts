import { NextRequest, NextResponse } from 'next/server';

// UX-level route protection only: checks that the auth cookie EXISTS so
// logged-out users land on /login without a flash of protected UI.
// Actual verification happens on the backend (the middleware has no JWT
// secret, by design) — an invalid token gets a 401 from the API and the
// fetch wrapper redirects to /login.
export function middleware(request: NextRequest) {
  const hasToken = request.cookies.has('access_token');
  const isLoginPage = request.nextUrl.pathname === '/login';

  if (!hasToken && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (hasToken && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.next();
}

export const config = {
  // everything except Next internals, the API proxy, and static assets
  matcher: ['/((?!_next|api|favicon.ico).*)'],
};
