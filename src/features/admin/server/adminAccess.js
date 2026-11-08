import { normalizeRuntimeConfig, resolveAccess, validAdminUid } from "../adminPolicy.js";

export const configuredOwnerUid = (env = globalThis.process?.env ?? {}) => {
  const uid = env.CHYTNU_OWNER_UID?.trim();
  if (uid && !validAdminUid(uid)) throw new TypeError("Neplatná serverová konfigurace OWNER.");
  return uid ?? "";
};
export const configuredCoCreatorUid = (env = globalThis.process?.env ?? {}) => {
  const uid = env.CHYTNU_CO_CREATOR_UID?.trim();
  if (uid && (!validAdminUid(uid) || uid === configuredOwnerUid(env))) throw new TypeError("Neplatná serverová konfigurace spolutvůrce.");
  return uid ?? "";
};

export async function loadAdminRuntime(db, uid, { env = globalThis.process?.env ?? {}, now = Date.now() } = {}) {
  const [account, config, suspended, deletion] = await Promise.all([
    db.collection("adminAccounts").doc(uid).get(), db.collection("adminConfig").doc("runtime").get(),
    db.collection("accountSuspensions").doc(uid).get(), db.collection("accountDeletions").doc(uid).get(),
  ]);
  const access = resolveAccess(uid, { ...(account.exists ? account.data() : {}),
    ...((suspended.exists || deletion.exists) ? { suspended: true } : {}) }, configuredOwnerUid(env), now, configuredCoCreatorUid(env));
  return { access, config: normalizeRuntimeConfig(config.exists ? config.data() : {}) };
}
