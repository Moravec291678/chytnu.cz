export function canAccessProtectedRoute({ user, guestActive }) {
  return Boolean(user || guestActive);
}

export function isPublicRoute(pathname) {
  return pathname === "/" || pathname === "/login" || pathname === "/privacy-policy" || pathname === "/terms";
}

export function resolveAuthenticatedRedirect({ status, user }) {
  return status === "ready" && user ? "/" : null;
}
