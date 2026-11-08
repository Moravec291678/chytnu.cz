import { configuredCoCreatorUid } from "./adminAccess.js";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { resolveAccess, hasAdminPermission, normalizeRuntimeConfig, normalizeAccountLimits, normalizeFeatureEntitlements, validAdminUid } from "../adminPolicy.js";
import { adminError } from "./adminValidation.js";

const PAGE = 50, COUNT_BOUND = 1000;
const safeDate = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const revision = record => Number.isSafeInteger(record?.revision) && record.revision >= 0 ? record.revision : 0;
const dataOf = snapshot => snapshot?.exists ? snapshot.data() : null;
const required = (condition, code = "forbidden", status = 403) => { if (!condition) throw adminError(code, status); };
function recent(identity, now) {
  const age = Math.floor(now / 1000) - identity.auth_time;
  required(Number.isSafeInteger(identity.auth_time) && age >= -60 && age <= 300, "recent_auth_required");
}
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
function decode(value, kind) {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (cursor?.kind !== kind) throw new Error();
    if (kind === "auth" ? typeof cursor.token !== "string" || cursor.token.length > 2048
      : !validAdminUid(cursor.id) || !safeDate(cursor.createdAt)) throw new Error();
    return cursor;
  } catch { throw adminError("invalid_cursor"); }
}

export function createAdminService({ db, auth, ownerUid = "", env = {}, now = () => Date.now() } = {}) {
  if (typeof db?.doc !== "function" || typeof db?.runTransaction !== "function" || typeof auth?.getUser !== "function") throw new TypeError("Admin service dependencies are required.");
  const trustedOwner = validAdminUid(ownerUid) ? ownerUid : "";
  const coCreatorUid = configuredCoCreatorUid(env);
  const at = () => new Date(now()).toISOString();
  const version = /^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA ?? "") ? env.VERCEL_GIT_COMMIT_SHA : "development";
  const ref = uid => db.doc(`adminAccounts/${uid}`);
  const accountRefs = uid => [ref(uid), db.doc(`accountSuspensions/${uid}`), db.doc(`accountDeletions/${uid}`)];
  async function actor(uid, transaction = null) {
    const get = transaction ? value => transaction.get(value) : value => value.get();
    const [record, suspended, deleted] = await Promise.all(accountRefs(uid).map(get));
    const access = resolveAccess(uid, { ...(dataOf(record) ?? {}), ...(suspended.exists ? { suspended: true } : {}) }, trustedOwner, now(), coCreatorUid);
    required(!deleted.exists && !access.suspended, "account_unavailable");
    return access;
  }
  function permit(access, permission) {
    if (permission === "users.read" && hasAdminPermission(access, "users.manage")) return;
    required(permission === "owner" ? access.role === "OWNER" : permission === "admin"
      ? access.role === "OWNER" || ["ADMIN", "CO_CREATOR"].includes(access.role) && access.permissions.length > 0 : hasAdminPermission(access, permission));
  }
  async function transaction(identity, permission, work) {
    const auditRef = db.doc(`adminAudit/${randomUUID()}`);
    return db.runTransaction(async tx => {
      const access = await actor(identity.uid, tx);
      permit(access, permission);
      const audit = (action, target, keys = []) => tx.set(auditRef, { actorUid: identity.uid, actorRole: access.role,
        action, target, changedFields: keys, createdAt: at() });
      return work(tx, access, audit);
    });
  }
  async function firebaseUser(uid) {
    try { return await auth.getUser(uid); }
    catch (error) { if (error?.code === "auth/user-not-found") throw adminError("user_not_found", 404); throw error; }
  }
  function userDto(user, account = {}) {
    const access = resolveAccess(user.uid, account ?? {}, trustedOwner, now(), coCreatorUid);
    return { uid: user.uid, email: typeof user.email === "string" ? user.email : null,
      displayName: typeof user.displayName === "string" ? user.displayName : null,
      role: access.role, suspended: access.suspended || user.disabled === true, disabled: user.disabled === true,
      permissions: access.permissions, limits: normalizeAccountLimits(account?.limits ?? {}), entitlements: normalizeFeatureEntitlements(account?.entitlements ?? {}),
      overrideExpiresAt: account?.overrideExpiresAt ?? null, revision: access.revision,
      createdAt: safeDate(user.metadata?.creationTime), lastSignInAt: safeDate(user.metadata?.lastSignInTime), authState: account?.authState ?? "applied" };
  }
  async function getUser(uid) {
    const [user, metadata, suspension] = await Promise.all([firebaseUser(uid), ref(uid).get(), db.doc(`accountSuspensions/${uid}`).get()]);
    return userDto(user, { ...(dataOf(metadata) ?? {}), ...(suspension.exists ? { suspended: true } : {}) });
  }
  async function listUsers(input) {
    let users, nextCursor = null;
    if (input.search) {
      try {
        const user = input.search.includes("@") ? await auth.getUserByEmail(input.search) : validAdminUid(input.search) ? await auth.getUser(input.search) : null;
        users = user ? [user] : [];
      } catch (error) { if (error?.code !== "auth/user-not-found") throw error; users = []; }
    } else {
      const cursor = decode(input.cursor, "auth");
      const page = await auth.listUsers(PAGE, cursor?.token);
      users = page.users;
      if (page.pageToken) nextCursor = encode({ kind: "auth", token: page.pageToken });
    }
    const documents = await Promise.all(users.map(user => ref(user.uid).get()));
    const rows = users.map((user, i) => userDto(user, dataOf(documents[i]))).filter(user => (!input.role || user.role === input.role)
      && (!input.status || (input.status === "suspended") === user.suspended));
    return { users: rows, nextCursor, filterScope: input.search ? "exact" : "page", pageSize: PAGE };
  }
  async function syncAuthStatus(uid) {
    // Firestore suspension is authoritative immediately. SDK work follows it and
    // rechecks revisions so late completions cannot silently hide a newer state.
    for (let attempt = 0; attempt < 2; attempt++) {
      const snapshot = await ref(uid).get();
      if (!snapshot.exists) return "pending";
      const state = snapshot.data(), expected = revision(state);
      try {
        await auth.updateUser(uid, { disabled: state.suspended === true });
        if (state.suspended) await auth.revokeRefreshTokens(uid);
      } catch { return "pending"; }
      const applied = await db.runTransaction(async tx => {
        const latest = await tx.get(ref(uid));
        if (!latest.exists || revision(latest.data()) !== expected) return false;
        tx.set(ref(uid), { ...latest.data(), authState: "applied" }); return true;
      });
      if (applied) return "applied";
    }
    return "pending";
  }
  async function updateUser(input, identity) {
    recent(identity, now());
    const targetAuth = await firebaseUser(input.uid);
    await transaction(identity, "users.manage", async (tx, access, audit) => {
      const [target, deleted] = await Promise.all([tx.get(ref(input.uid)), tx.get(db.doc(`accountDeletions/${input.uid}`))]);
      required(!deleted.exists, "account_unavailable");
      const current = dataOf(target) ?? {};
      required(revision(current) === input.expectedRevision, "revision_conflict", 409);
      const targetAccess = resolveAccess(input.uid, current, trustedOwner, now(), coCreatorUid);
      required(targetAccess.role !== "OWNER", "owner_protected");
      if (access.role !== "OWNER") {
        required(input.uid !== access.uid && !["ADMIN", "CO_CREATOR"].includes(targetAccess.role), "target_protected");
        required(Object.keys(input.patch).every(key => key === "suspended"), "owner_required");
      }
      required(targetAccess.role !== "CO_CREATOR" || !Object.hasOwn(input.patch, "role"), "role_protected");
      const next = { role: "USER", suspended: targetAuth.disabled === true, permissions: [], limits: {}, entitlements: {}, overrideExpiresAt: null,
        ...current, ...input.patch, revision: revision(current) + 1, updatedAt: at(), updatedBy: identity.uid };
      if (next.role !== "ADMIN") {
        required(!input.patch.permissions?.length, "invalid_permissions", 400); next.permissions = [];
      }
      if (Object.hasOwn(input.patch, "suspended")) next.authState = "pending";
      tx.set(ref(input.uid), next);
      if (next.suspended) tx.set(db.doc(`accountSuspensions/${input.uid}`), { uid: input.uid, suspended: true, updatedAt: at(), updatedBy: identity.uid });
      else tx.delete(db.doc(`accountSuspensions/${input.uid}`));
      audit("user.update", input.uid, Object.keys(input.patch));
    });
    const authState = Object.hasOwn(input.patch, "suspended") ? await syncAuthStatus(input.uid) : null;
    const user = await getUser(input.uid);
    return { user: { ...user, ...(authState ? { authState } : {}) } };
  }
  async function pageCollection(name, cursorValue) {
    const cursor = decode(cursorValue, name);
    let query = db.collection(name).orderBy("createdAt", "desc").orderBy("__name__", "desc");
    if (cursor) query = query.startAfter(cursor.createdAt, cursor.id);
    const snapshot = await query.limit(PAGE + 1).get();
    const docs = snapshot.docs.slice(0, PAGE), last = docs.at(-1);
    return { rows: docs.map(doc => ({ ...doc.data(), id: doc.id })), nextCursor: snapshot.docs.length > PAGE && last ? encode({ kind: name, id: last.id, createdAt: last.data().createdAt }) : null };
  }
  async function config() {
    return normalizeRuntimeConfig(dataOf(await db.doc("adminConfig/runtime").get()) ?? {});
  }
  async function updateConfig(input, identity) {
    recent(identity, now());
    return transaction(identity, "owner", async (tx, access, audit) => {
      const configRef = db.doc("adminConfig/runtime"), stored = await tx.get(configRef);
      const current = normalizeRuntimeConfig(dataOf(stored) ?? {});
      required(current.revision === input.expectedRevision, "revision_conflict", 409);
      const next = normalizeRuntimeConfig({ ...current, limits: { ...current.limits, ...input.patch.limits },
        features: { ...current.features, ...input.patch.features }, revision: current.revision + 1, updatedAt: at(), updatedBy: access.uid });
      tx.set(configRef, next); audit("config.update", "runtime", Object.keys(input.patch)); return { config: next };
    });
  }
  async function saveTask(input, identity) {
    const id = input.id ?? randomUUID();
    return transaction(identity, "tasks", async (tx, access, audit) => {
      const taskRef = db.doc(`adminTasks/${id}`), snapshot = await tx.get(taskRef), current = dataOf(snapshot);
      required(!input.id || current, "task_not_found", 404);
      required(revision(current) === input.expectedRevision, "revision_conflict", 409);
      const task = { ...input.task, id, revision: revision(current) + 1, createdAt: current?.createdAt ?? at(), updatedAt: at(), updatedBy: access.uid };
      tx.set(taskRef, task); audit(current ? "task.update" : "task.create", id, Object.keys(input.task)); return { task };
    });
  }
  async function deleteTask(input, identity) {
    return transaction(identity, "tasks", async (tx, access, audit) => {
      const taskRef = db.doc(`adminTasks/${input.id}`), snapshot = await tx.get(taskRef), current = dataOf(snapshot);
      required(current, "task_not_found", 404); required(revision(current) === input.expectedRevision, "revision_conflict", 409);
      tx.delete(taskRef); audit("task.delete", input.id); return { deleted: true };
    });
  }
  async function boundedCount(field, value) {
    let query = db.collection("adminAccounts");
    if (field) query = query.where(field, "==", value);
    const count = (await query.limit(COUNT_BOUND + 1).count().get()).data().count;
    return Number.isSafeInteger(count) && count <= COUNT_BOUND ? count : null;
  }
  async function overview(access) {
    const counts = hasAdminPermission(access, "users.read") ? await Promise.all([boundedCount(), boundedCount("role", "TESTER"), boundedCount("suspended", true)]) : [null, null, null];
    const tasks = hasAdminPermission(access, "tasks") ? (await db.collection("adminTasks").where("status", "in", ["New", "Planned", "In Progress", "Testing"]).limit(COUNT_BOUND + 1).count().get()).data().count : null;
    return { registeredUsers: null, managedUsers: counts[0], testers: counts[1], suspended: counts[2], openTasks: Number.isSafeInteger(tasks) && tasks <= COUNT_BOUND ? tasks : null, countsBounded: true,
      countNote: "Celkový počet registrací není dostupný. Provozní počty zahrnují spravované účty, nejvýše 1000.", version,
      features: (await config()).features, health: { adminApi: "available", firebase: "available", aiProvider: "not_probed", photoUploadFailures: null, syncErrors: null, deferredJobs: null } };
  }
  async function monitoring() {
    const earliest = new Date(now() - 29 * 86400000).toISOString().slice(0, 10);
    const [diagnostics, quota] = await Promise.all([db.collection("adminAiDiagnostics").where("dayUtc", ">=", earliest).orderBy("dayUtc", "desc").limit(30).get(), db.doc("serverRateLimits/ai-free-cloudflare-global").get()]);
    const ai = { providerRequests: 0, providerSuccesses: 0, providerErrors: 0, days: diagnostics.docs.length, lastErrorCode: null, lastRequestAt: null };
    for (const document of diagnostics.docs) {
      const data = document.data();
      for (const key of ["providerRequests", "providerSuccesses", "providerErrors"]) if (Number.isSafeInteger(data[key]) && data[key] >= 0) ai[key] += data[key];
      if (!ai.lastErrorCode && typeof data.lastErrorCode === "string" && /^[a-z0-9_]{1,60}$/.test(data.lastErrorCode)) ai.lastErrorCode = data.lastErrorCode;
      if (!ai.lastRequestAt) ai.lastRequestAt = safeDate(data.lastRequestAt);
    }
    const source = dataOf(quota), safeQuota = source ? Object.fromEntries(["dayUtc", "reservedNeurons", "textReservedNeurons", "blockedDay"].filter(key => Number.isSafeInteger(source[key]) && source[key] >= 0).map(key => [key, source[key]])) : null;
    const model = env.AI_CLOUDFLARE_MODEL === "@cf/google/gemma-4-26b-a4b-it" ? env.AI_CLOUDFLARE_MODEL : null;
    const configured = env.AI_PROVIDER === "cloudflare" && Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN && model);
    if (!diagnostics.docs.length) Object.assign(ai, { providerRequests: null, providerSuccesses: null, providerErrors: null });
    const currentDay = Math.floor(now() / 86400000);
    const currentQuota = safeQuota && safeQuota.dayUtc === currentDay ? safeQuota : null;
    return { ai, quota: currentQuota, version, provider: { configured, zeroCostConfirmed: null, model, status: configured ? "configured" : "unavailable", connection: "not_probed" },
      syncErrors: null, photoUploadFailures: null, deferredJobs: null, serviceHealth: "available" };
  }
  const permissions = { overview: "admin", "users.list": "users.read", "users.get": "users.read", "users.update": "users.manage",
    "config.get": "owner", "config.update": "owner", "tasks.list": "tasks", "tasks.save": "tasks", "tasks.delete": "tasks", "audit.list": "audit", monitoring: "monitoring" };
  return { async execute(input, identity) {
    const access = await actor(identity.uid);
    if (input.action === "self") return { access };
    permit(access, permissions[input.action]);
    if (input.action === "overview") return overview(access);
    if (input.action === "users.list") return listUsers(input);
    if (input.action === "users.get") return { user: await getUser(input.uid) };
    if (input.action === "users.update") return updateUser(input, identity);
    if (input.action === "config.get") return { config: await config() };
    if (input.action === "config.update") return updateConfig(input, identity);
    if (input.action === "tasks.list") {
      const page = await pageCollection("adminTasks", input.cursor);
      return { tasks: page.rows.filter(task => (!input.status || task.status === input.status) && (!input.category || task.category === input.category)
        && (!input.search || `${task.title} ${task.description}`.toLocaleLowerCase("cs-CZ").includes(input.search.toLocaleLowerCase("cs-CZ")))), nextCursor: page.nextCursor, filterScope: "page" };
    }
    if (input.action === "tasks.save") return saveTask(input, identity);
    if (input.action === "tasks.delete") return deleteTask(input, identity);
    if (input.action === "audit.list") { const page = await pageCollection("adminAudit", input.cursor); return { entries: page.rows, nextCursor: page.nextCursor }; }
    if (input.action === "monitoring") return monitoring();
    throw adminError("invalid_action");
  } };
}
