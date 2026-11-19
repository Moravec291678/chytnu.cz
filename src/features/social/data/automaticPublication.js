import { socialRequest } from "./socialClient.js";
import { privacyRepository } from "../../privacy/data/privacyRepository.js";
import { accountScopeKey } from "../../auth/data/localDataScope.js";
import { firebaseAuth } from "../../auth/data/firebaseAuth.js";
// Independent from the local save and sync acknowledgement. Server checks consent,
// age, source privacy, photo ownership and a stable post ID on every attempt.
const attempts = new Map();
export async function publishNewSyncedCatches(uid, { request = socialRequest, now = Date.now,
  readSettings = scope => privacyRepository.get(scope), activeUid = () => firebaseAuth.currentUserId() } = {}) {
  if (!uid || now() < (attempts.get(uid) ?? 0)) return;
  attempts.set(uid, now() + 60_000);
  try {
    const settings = await readSettings({ownerId:uid,scopeKey:accountScopeKey(uid)});
    if (activeUid() !== uid || !settings.hasSavedSettings || !settings.defaultCatchVisibilityExplicit || settings.defaultCatchVisibility !== "public") return;
    await request("posts.publishNew");
  }
  catch { attempts.set(uid, now() + 120_000); }
}
