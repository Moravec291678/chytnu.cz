import { randomUUID } from "node:crypto";
import { getAccountDeletionAdminContext } from "../../../server/cloudinaryApi.js";
import { configuredOwnerUid } from "./adminAccess.js";

// Reuses the existing authorized daily cron. Date-based suspensions are restored
// at the next successful daily run, not by pretending a revoked Auth login works.
export async function restoreExpiredSuspensions({ db, auth, ownerUid = "", now = Date.now() }) {
  const docs = await db.collection("accountSuspensions").where("expiresAt", "<=", new Date(now).toISOString()).limit(20).get();
  let restored = 0, failed = 0;
  for (const doc of docs.docs) {
    if (doc.id === ownerUid) continue;
    const accountRef = db.doc(`adminAccounts/${doc.id}`);
    try {
      if ((await db.doc(`accountDeletions/${doc.id}`).get()).exists) continue;
      await auth.updateUser(doc.id, { disabled: false });
      const applied = await db.runTransaction(async tx => {
        const [current, account, deleted] = await Promise.all([tx.get(doc.ref), tx.get(accountRef), tx.get(db.doc(`accountDeletions/${doc.id}`))]);
        if (!current.exists || current.data().expiresAt !== doc.data().expiresAt || current.data().updatedAt !== doc.data().updatedAt || deleted.exists || Date.parse(current.data().expiresAt) > now) return false;
        const data = account.exists ? account.data() : {};
        tx.set(accountRef, { ...data, suspended: false, suspensionExpiresAt: null, authState: "applied", revision: (data.revision ?? 0) + 1, updatedAt: new Date(now).toISOString() });
        tx.delete(doc.ref);
        tx.set(db.doc(`adminAudit/${randomUUID()}`), { actorUid: "system", actorRole: "SYSTEM", action: "suspension.expire", target: doc.id, createdAt: new Date(now).toISOString(), changedFields: ["suspended"] });
        return true;
      });
      if (applied) restored++;
      else if ((await doc.ref.get()).exists || (await db.doc(`accountDeletions/${doc.id}`).get()).exists) await auth.updateUser(doc.id, { disabled: true });
    } catch {
      failed++;
      try { if ((await doc.ref.get()).exists || (await db.doc(`accountDeletions/${doc.id}`).get()).exists) await auth.updateUser(doc.id, { disabled: true }); } catch { /* Firestore remains the access boundary. */ }
    }
  }
  return { restored, failed };
}
export async function restoreProductionExpiredSuspensions() {
  const env = globalThis.process?.env ?? {}, context = await getAccountDeletionAdminContext(env);
  return restoreExpiredSuspensions({ ...context, ownerUid: configuredOwnerUid(env) });
}
