/** An edit retains the server identity, immutable type and loaded CAS revision. */
export const DEFAULT_NEW_ENTRY_VISIBILITY = "public";

export function entryComposerPayload(draft, initialPost) {
  const kind = initialPost?.kind ?? draft.kind;
  return {
    entryId: initialPost?.sourceEntryId ?? draft.entryId,
    kind,
    visibility: draft.visibility,
    expectedRevision: initialPost?.revision ?? 0,
    description: draft.description.trim(),
    ...(kind === "experience" ? { title: draft.title.trim() } : {}),
    ...(kind === "achievement" ? { achievementId: draft.achievementId } : {}),
  };
}
