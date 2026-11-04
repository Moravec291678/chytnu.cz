const ACTIONS = new Set(["summarize", "improve", "clarity", "title"]);

export function createStoryDraft(originalNotes, output, action) {
  if (typeof originalNotes !== "string" || originalNotes.length > 12_000 || !ACTIONS.has(action)
    || typeof output !== "string" || !output.trim() || output.length > 16_000) throw new TypeError("Invalid story draft.");
  return { originalNotes, text: output.trim(), action, status: "draft", requiresFactReview: true };
}

// Caller must present the draft for fact review; never auto-save generated text.
export function approveStoryDraft(record, draft, approved) {
  if (approved !== true || draft?.status !== "draft" || record.notes !== draft.originalNotes) return record;
  const validated = createStoryDraft(draft.originalNotes, draft.text, draft.action);
  if (draft.action === "clarity" || draft.action === "title") return record;
  return { ...record, notes: validated.text, aiStory: { action: draft.action, approved: true } };
}
