import { createPublicCatchProjection } from "../../privacy/data/privacyModel.js";

export function buildLocalCommunityFeed(catches = []) {
  return catches
    .map((record) => {
      const projection = createPublicCatchProjection(record);
      return projection ? { id: `local:${record.id}`, catchId: record.id, projection } : null;
    })
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.projection.caughtAt) - Date.parse(left.projection.caughtAt));
}
