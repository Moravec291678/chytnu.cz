import { createPublicCatchProjection } from "../../privacy/data/privacyModel.js";

export function buildLocalCommunityFeed(catches = [], moderation = new Map()) {
  return catches
    .map((record) => {
      const projection = createPublicCatchProjection({ ...record, publicModeration: moderation.get(record.id) });
      return projection ? { id: `local:${record.id}`, catchId: record.id, projection } : null;
    })
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.projection.caughtAt) - Date.parse(left.projection.caughtAt));
}
