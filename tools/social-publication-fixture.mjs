// These fixtures deliberately publish their synthetic profile. Passing the same
// acknowledgement as the settings UI preserves the real server consent gate.
// Negative consent tests must invoke the handler/repository without this helper.
export async function publicProfileFixtureConsent(profile, db, uid) {
  if (profile?.visibility !== "public") return undefined;
  const receipt = (await db.doc(`users/${uid}/socialPreferences/publication`).get()).data();
  return { version: 1, mode: "public", expectedEpoch: receipt?.epoch ?? 0 };
}

export async function publicProfileFixturePayload(action, payload, db, uid) {
  if (action !== "save" || Object.hasOwn(payload, "publicationConsent")) return payload;
  const publicationConsent = await publicProfileFixtureConsent(payload.profile, db, uid);
  return publicationConsent ? { ...payload, publicationConsent } : payload;
}
