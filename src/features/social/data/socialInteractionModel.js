export const REACTION_KINDS = Object.freeze(["respect", "amazing", "trophy", "atmosphere"]);
export const REPORT_REASONS = Object.freeze(["spam", "harassment", "inappropriate", "suspicious_catch", "privacy", "other"]);
export const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fail = () => { throw new TypeError("invalid_interaction"); };
export function interactionPostId(value) { if (!/^[a-f0-9]{64}$/.test(value ?? "")) fail(); return value; }
export function interactionUuid(value) { if (typeof value !== "string" || !UUID_PATTERN.test(value)) fail(); return value; }
export function commentText(value) {
  if (typeof value !== "string" || value.length > 500 || !value.trim() || Array.from(value).some(c => c.charCodeAt(0) < 32 && !["\n", "\r", "\t"].includes(c))) fail();
  return value.replace(/\r\n?/g, "\n").trim();
}
export function interactionInput(input, action) {
  const allowed = { reaction: ["postId", "kind", "operationId"], save: ["postId", "commentId", "text", "expectedRevision"], delete: ["postId", "commentId", "expectedRevision"], list: ["postId", "cursor"], report: ["postId", "commentId", "reason", "details"] }[action];
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) fail();
  interactionPostId(input.postId);
  if (action === "reaction") { interactionUuid(input.operationId); if (input.kind !== null && !REACTION_KINDS.includes(input.kind)) fail(); }
  if (["save", "delete"].includes(action)) {
    interactionUuid(input.commentId);
    if ((action === "save" || input.expectedRevision !== undefined) && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)) fail();
  }
  if (action === "report") {
    if (input.commentId !== undefined) interactionUuid(input.commentId);
    if (!REPORT_REASONS.includes(input.reason)) fail();
    if (input.details !== undefined && (typeof input.details !== "string" || input.details.length > 500)) fail();
  }
  return action === "save" ? { ...input, text: commentText(input.text) } : input;
}
