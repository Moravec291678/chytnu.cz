import { createHash } from "node:crypto";
import { publicCatchProjection } from "../data/publicProfileModel.js";
// Old profile selections remain supported, but source edits require new approval
// just like versioned posts. Never silently refresh approved public information.
export function legacyShareApproval(record, photo = null) {
  const projection=publicCatchProjection(record);
  return createHash("sha256").update(JSON.stringify({species:projection?.species,lengthCm:projection?.lengthCm,caughtAt:projection?.caughtAt,
    privacy:record?.privacy ?? "private",photoSha:photo?.cloud?.sha256 ?? null})).digest("hex");
}
