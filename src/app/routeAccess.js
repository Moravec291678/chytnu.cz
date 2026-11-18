export function canAccessProtectedRoute({ user, guestActive }) {
  return Boolean(user || guestActive);
}

export function isPublicRoute(pathname) {
  return pathname === "/" || pathname === "/login" || pathname === "/privacy-policy" || pathname === "/terms"
    || /^\/u\/[^/]+\/?$/.test(pathname) || /^\/community\/post\/[a-f0-9]{64}\/?$/.test(pathname);
}

export function resolveAuthenticatedRedirect({ status, user }) {
  return status === "ready" && user ? "/" : null;
}
