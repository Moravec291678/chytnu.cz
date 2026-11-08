const IDENTITIES = Object.freeze({
  OWNER: Object.freeze({ role: "OWNER", label: "Zakladatel ChytnuCz", shortLabel: "Zakladatel", badge: "Founder & Owner", theme: "founder" }),
  CO_CREATOR: Object.freeze({ role: "CO_CREATOR", label: "Spolutvůrce ChytnuCz", shortLabel: "Spolutvůrce", badge: "Co-Creator & Fishing Lead", theme: "creator" }),
});

// Project only a trusted server role. Suitable for public presentation: no UID,
// email, permissions, quotas or user-editable cosmetic/profile fields.
export function collaboratorIdentity(access) {
  return access && !access.suspended && Object.hasOwn(IDENTITIES, access.role) ? { ...IDENTITIES[access.role] } : null;
}
