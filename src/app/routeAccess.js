export function canAccessProtectedRoute({ user, guestActive }) {
  return Boolean(user || guestActive);
}
