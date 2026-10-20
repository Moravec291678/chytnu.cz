export function resolveWaterEditorView({ waterId, loading, record, error }) {
  if (!waterId) return "editor";
  if (loading) return "loading";
  if (record) return "editor";
  if (error) return "error";
  return "not-found";
}
