import { readFirebaseServiceAccount, initializeFirebaseAdminContext, verifyFirebaseIdToken } from "./cloudinaryApi.js";
import { calculateServerCatchReward, getServerSyncedPhotoHashes } from "./serverRewardCalculator.js";
import { FieldValue } from "firebase-admin/firestore";
import { reconcileProgressionTotals } from "../features/progression/data/progressionReconciliation.js";

const CATCH_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function send(res, status, payload) {
  res.setHeader?.("Cache-Control", "no-store");
  return res.status(status).json(payload);
}

function parseRequest(req) {
  let body = req.body;
  if (typeof body === "string") {
    if (new TextEncoder().encode(body).length > 2048) return null;
    try { body = JSON.parse(body); } catch { return null; }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).length !== 1 || typeof body.catchId !== "string" || !CATCH_ID_PATTERN.test(body.catchId)) return null;
  return body;
}

function parseReconciliationRequest(req) {
  let body = req.body;
  if (typeof body === "string") {
    if (new TextEncoder().encode(body).length > 512) return null;
    try { body = JSON.parse(body); } catch { return null; }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).length !== 2
    || !Object.hasOwn(body, "localProgressionXp") || !Object.hasOwn(body, "pendingCatchXp")) return null;
  const validXp = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000;
  return validXp(body.localProgressionXp) && validXp(body.pendingCatchXp) ? body : null;
}

function pragueDayKey(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export async function createServerProgressionApi({
  env = globalThis.process?.env ?? {},
  verifyToken,
  claimCatch,
  reconcileTotals,
  consumeRateLimit = async () => true,
  now = () => Date.now(),
} = {}) {
  async function claim(req, res) {
    if (req.method !== "POST") {
      res.setHeader?.("Allow", "POST");
      return send(res, 405, { error: "method_not_allowed" });
    }
    if (env.SERVER_PROGRESSION_SHADOW !== "true") return send(res, 503, { error: "server_progression_disabled" });
    let serviceAccount;
    try { serviceAccount = readFirebaseServiceAccount(env); }
    catch { return send(res, 503, { error: "server_auth_unavailable" }); }
    const authorization = req.headers?.authorization ?? req.headers?.Authorization;
    const bearer = typeof authorization === "string" ? authorization.match(/^Bearer ([^\s]+)$/) : null;
    if (!bearer) return send(res, 401, { error: "authentication_required" });
    let identity;
    try { identity = await verifyToken(bearer[1], serviceAccount); }
    catch { return send(res, 401, { error: "authentication_required" }); }
    if (typeof identity?.uid !== "string" || !identity.uid || identity.uid.includes("/") || identity.uid.length > 128) {
      return send(res, 401, { error: "authentication_required" });
    }
    const body = parseRequest(req);
    if (!body) return send(res, 400, { error: "invalid_request" });
    let allowed;
    try { allowed = await consumeRateLimit(identity.uid, now()); }
    catch { return send(res, 503, { error: "server_progression_unavailable" }); }
    if (!allowed) return send(res, 429, { error: "rate_limited" });
    try {
      const result = await claimCatch(identity.uid, body.catchId, now());
      if (!result) return send(res, 404, { error: "catch_not_found" });
      return send(res, 200, { mode: "shadow", ...result });
    } catch (error) {
      const status = error?.statusCode === 404 ? 404 : 503;
      return send(res, status, { error: status === 404 ? "catch_not_found" : "server_progression_unavailable" });
    }
  }
  async function reconcile(req, res) {
    if (req.method !== "POST") {
      res.setHeader?.("Allow", "POST");
      return send(res, 405, { error: "method_not_allowed" });
    }
    if (env.SERVER_PROGRESSION_SHADOW !== "true") return send(res, 503, { error: "server_progression_disabled" });
    let serviceAccount;
    try { serviceAccount = readFirebaseServiceAccount(env); }
    catch { return send(res, 503, { error: "server_auth_unavailable" }); }
    const authorization = req.headers?.authorization ?? req.headers?.Authorization;
    const bearer = typeof authorization === "string" ? authorization.match(/^Bearer ([^\s]+)$/) : null;
    if (!bearer) return send(res, 401, { error: "authentication_required" });
    let identity;
    try { identity = await verifyToken(bearer[1], serviceAccount); }
    catch { return send(res, 401, { error: "authentication_required" }); }
    if (typeof identity?.uid !== "string" || !identity.uid || identity.uid.includes("/") || identity.uid.length > 128) {
      return send(res, 401, { error: "authentication_required" });
    }
    const body = parseReconciliationRequest(req);
    if (!body) return send(res, 400, { error: "invalid_request" });
    let allowed;
    try { allowed = await consumeRateLimit(identity.uid, now()); }
    catch { return send(res, 503, { error: "server_progression_unavailable" }); }
    if (!allowed) return send(res, 429, { error: "rate_limited" });
    if (typeof reconcileTotals !== "function") return send(res, 503, { error: "server_progression_unavailable" });
    try {
      const result = await reconcileTotals(identity.uid, body, now());
      return send(res, 200, { mode: "shadow", ...result });
    } catch { return send(res, 503, { error: "server_progression_unavailable" }); }
  }
  return { claim, reconcile };
}

export function createAdminProgressionReconciler(db, serverTimestamp) {
  return async (ownerId, { localProgressionXp, pendingCatchXp }) => {
    const userRef = db.doc(`users/${ownerId}`);
    const eventsQuery = userRef.collection("serverProgressionEvents");
    const stateRef = userRef.collection("serverProgressionState").doc("summary");
    return db.runTransaction(async (transaction) => {
      const [stateSnapshot, eventsSnapshot] = await Promise.all([
        transaction.get(stateRef), transaction.get(eventsQuery),
      ]);
      const serverEventXp = (eventsSnapshot.docs ?? []).reduce((sum, eventSnapshot) => {
        const event = eventSnapshot.data();
        return event?.ownerId === ownerId && Number.isSafeInteger(event.xp) && event.xp > 0
          ? sum + event.xp : sum;
      }, 0);
      const result = reconcileProgressionTotals({
        legacyBaselineXp: stateSnapshot.exists ? stateSnapshot.data()?.legacyBaselineXp : 0,
        serverEventXp, localProgressionXp, pendingCatchXp,
      });
      transaction.set(stateRef, {
        ownerId, legacyBaselineXp: result.legacyBaselineXp,
        updatedAt: serverTimestamp(),
        ...(stateSnapshot.exists ? {} : { createdAt: serverTimestamp(), schemaVersion: 1 }),
      });
      return result;
    });
  };
}

export function createAdminClaimer(db, serverTimestamp) {
  return async (ownerId, catchId, nowMs) => {
    const userRef = db.doc(`users/${ownerId}`);
    const catchRef = userRef.collection("catches").doc(catchId);
    return db.runTransaction(async (transaction) => {
      const catchSnapshot = await transaction.get(catchRef);
      if (!catchSnapshot.exists || catchSnapshot.data()?.deleted || catchSnapshot.data()?.ownerId !== ownerId) return null;
      const catchRecord = { ...catchSnapshot.data(), id: catchSnapshot.id };
      const tripRef = catchRecord.tripId ? userRef.collection("trips").doc(catchRecord.tripId) : null;
      const waterRef = catchRecord.waterId ? userRef.collection("waters").doc(catchRecord.waterId) : null;
      const photoHashes = getServerSyncedPhotoHashes(catchRecord, ownerId);
      const photoClaimRefs = photoHashes.map((hash) => userRef.collection("serverProgressionPhotoClaims").doc(hash));
      const existingPhotoQueries = photoHashes.map((hash) => db.collectionGroup("photos").where("cloud.sha256", "==", hash));
      const stateRef = userRef.collection("serverProgressionCatchState").doc(catchId);
      const createdRef = userRef.collection("serverProgressionEvents").doc(`catch-created-${catchId}`);
      const photoRef = userRef.collection("serverProgressionEvents").doc(`catch-photo-${catchId}`);
      const contextRef = userRef.collection("serverProgressionEvents").doc(`catch-context-${catchId}`);
      const limitedRef = userRef.collection("serverProgressionEvents").doc(`catch-limited-${catchId}`);
      const nowDate = new Date(nowMs);
      const dayKey = pragueDayKey(nowDate);
      const capRef = userRef.collection("serverProgressionDailyCaps").doc(dayKey);
      const [tripSnapshot, waterSnapshot, createdSnapshot, photoSnapshot, contextSnapshot, limitedSnapshot, photoClaimSnapshots, existingPhotoSnapshots, capSnapshot] = await Promise.all([
        tripRef ? transaction.get(tripRef) : null,
        waterRef ? transaction.get(waterRef) : null,
        transaction.get(createdRef), transaction.get(photoRef), transaction.get(contextRef),
        transaction.get(limitedRef), Promise.all(photoClaimRefs.map((ref) => transaction.get(ref))),
        Promise.all(existingPhotoQueries.map((query) => transaction.get(query))), transaction.get(capRef),
      ]);
      const existingEvents = [createdSnapshot, photoSnapshot, contextSnapshot, limitedSnapshot].filter((snapshot) => snapshot?.exists).map((snapshot) => snapshot.data());
      const currentXp = existingEvents.reduce((total, event) => total + Math.max(0, Number(event.xp) || 0), 0);
      const duplicatePhotoHashes = new Set();
      for (let index = 0; index < photoHashes.length; index += 1) {
        const claim = photoClaimSnapshots[index]?.exists ? photoClaimSnapshots[index].data() : null;
        const duplicateClaim = claim && claim.catchId !== catchId;
        const duplicateExistingCatch = existingPhotoSnapshots[index]?.docs?.some((photoSnapshot) => {
          const segments = photoSnapshot.ref.path.split("/");
          return segments.length === 6 && segments[0] === "users" && segments[1] === ownerId
            && segments[2] === "catches" && segments[3] !== catchId && segments[4] === "photos"
            && photoSnapshot.data()?.deleted !== true;
        });
        if (duplicateClaim || duplicateExistingCatch) duplicatePhotoHashes.add(photoHashes[index]);
      }
      const decision = calculateServerCatchReward({
        catchRecord,
        ownerId,
        trip: tripSnapshot?.exists ? { ...tripSnapshot.data(), id: tripSnapshot.id } : null,
        water: waterSnapshot?.exists ? { ...waterSnapshot.data(), id: waterSnapshot.id } : null,
        photoHashes,
        duplicatePhotoHashes,
        currentXp,
        dailyLimitedXp: Number(capSnapshot?.data()?.xp) || 0,
        limitedAlreadyClaimed: limitedSnapshot?.exists ?? false,
        now: nowMs,
      });
      const eventRefs = {
        "catch.created": createdRef, "catch.photo": photoRef,
        "catch.context": contextRef, "catch.limited": limitedRef,
      };
      const createdEventIds = [];
      for (const event of decision.events) {
        const ref = eventRefs[event.type];
        if (!ref) continue;
        const snapshot = event.type === "catch.created" ? createdSnapshot
          : event.type === "catch.photo" ? photoSnapshot
            : event.type === "catch.context" ? contextSnapshot : limitedSnapshot;
        if (snapshot?.exists) continue;
        const eventId = ref.id;
        transaction.create(ref, {
          id: eventId, eventId, ownerId, catchId, type: event.type, xp: event.xp,
          verificationLevel: decision.level, photoHash: decision.photoHash,
          createdAt: serverTimestamp(), source: "server-shadow", schemaVersion: 1,
        });
        createdEventIds.push(eventId);
      }
      const photoHashIndex = photoHashes.indexOf(decision.photoHash);
      const photoClaimRef = photoHashIndex >= 0 ? photoClaimRefs[photoHashIndex] : null;
      const photoClaimSnapshot = photoHashIndex >= 0 ? photoClaimSnapshots[photoHashIndex] : null;
      if (photoClaimRef && decision.eligible && !photoClaimSnapshot?.exists) {
        transaction.create(photoClaimRef, { ownerId, catchId, photoHash: decision.photoHash, createdAt: serverTimestamp() });
      }
      if (decision.events.some((event) => event.type === "catch.limited") && !limitedSnapshot?.exists) {
        transaction.set(capRef, {
          ownerId, dayKey,
          xp: (Number(capSnapshot?.data()?.xp) || 0) + decision.deltaXp,
          updatedAt: serverTimestamp(),
        });
      }
      const totalXp = currentXp + decision.deltaXp;
      transaction.set(stateRef, {
        ownerId, catchId, level: decision.level, eligible: decision.eligible,
        reason: decision.reason, photoHash: decision.photoHash, awardedXp: totalXp,
        evaluatedAt: serverTimestamp(), lastEventIds: createdEventIds,
      });
      return {
        catchId, verificationLevel: decision.level, eligible: decision.eligible,
        reason: decision.reason, xpAwarded: decision.deltaXp, totalCatchXp: totalXp,
        eventIds: createdEventIds,
      };
    });
  };
}

let adminContextPromise;
async function productionAdmin(env) {
  const serviceAccount = readFirebaseServiceAccount(env);
  adminContextPromise ??= initializeFirebaseAdminContext(serviceAccount);
  try { return await adminContextPromise; } catch (error) { adminContextPromise = null; throw error; }
}

export async function createProductionServerProgressionApi({ env = globalThis.process?.env ?? {}, now = () => Date.now() } = {}) {
  return createServerProgressionApi({
    env,
    now,
    verifyToken: async (token) => {
      const { auth, db } = await productionAdmin(env);
      const identity = await verifyFirebaseIdToken(auth, token);
      if ((await db.doc(`accountDeletions/${identity.uid}`).get()).exists) throw new Error("account_deletion_started");
      return identity;
    },
    consumeRateLimit: async (uid, timestamp) => {
      const { db, Timestamp } = await productionAdmin(env);
      const bucket = Math.floor(timestamp / RATE_WINDOW_MS);
      const ref = db.doc(`serverRateLimits/progression-${uid}`);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const data = snapshot.exists ? snapshot.data() : {};
        if (data.bucket === bucket && Number(data.count) >= RATE_LIMIT) return false;
        transaction.set(ref, { bucket, count: data.bucket === bucket ? (Number(data.count) || 0) + 1 : 1,
          expiresAt: Timestamp.fromMillis((bucket + 2) * RATE_WINDOW_MS) });
        return true;
      });
    },
    claimCatch: async (uid, catchId, timestamp) => {
      const { db } = await productionAdmin(env);
      return createAdminClaimer(db, FieldValue.serverTimestamp)(uid, catchId, timestamp);
    },
    reconcileTotals: async (uid, input) => {
      const { db } = await productionAdmin(env);
      return createAdminProgressionReconciler(db, FieldValue.serverTimestamp)(uid, input);
    },
  });
}
