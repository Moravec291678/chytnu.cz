export function canAccessProtectedRoute({ user, guestActive }) {
  return Boolean(user || guestActive);
}

export function resolveAuthenticatedRedirect({ status, user }) {
  return status === "ready" && user ? "/" : null;
}
