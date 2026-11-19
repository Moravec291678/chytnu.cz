import { createHash } from "node:crypto";
import { AI_CONSENT_VERSION, AI_FEATURES, hasAiConsent } from "../aiPolicy.js";
import { analyzeDiary } from "../diaryAnalysis.js";
import { createStoryDraft } from "../storyDraft.js";
import { getAccountDeletionAdminContext } from "../../../server/cloudinaryApi.js";
import { AiServiceError, safeAiDiagnostic } from "./aiServiceError.js";
import { effectiveUserReservation, isRuntimeFeatureEnabled, normalizeRuntimeConfig, resolveAccess } from "../../admin/adminPolicy.js";
import { configuredOwnerUid, configuredCoCreatorUid } from "../../admin/server/adminAccess.js";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const SHA = /^[a-f0-9]{64}$/;
// Keep the stored consent schema readable across app versions; removed capabilities
// are forced false and have no request action or provider implementation.
const CAPABILITIES = ["species", "stories", "diary", "recommendations"];
const TASKS = ["summarize", "improve", "clarity", "title"];
const ACTIONS = ["consent.get", "consent.update", "consent.revoke", "story", "recommendations"];
const EVIDENCE_KEYS = ["count", "species", "hours", "months", "methods", "baits", "measuredLengthCount", "meanLengthCm", "longestCm", "missing", "period", "limitations"];
const encode = new TextEncoder();
const hash = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const own = (record, uid, id) => typeof id === "string" && ID.test(id)
  && record && record.ownerId === uid && record.id === id && record.deleted !== true;
const failure = (code, status) => Object.assign(new Error(code), { aiCode: code, aiStatus: status });
const send = (res, status, body) => { res.setHeader?.("Cache-Control", "no-store"); return res.status(status).json(body); };

function validCapabilities(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === CAPABILITIES.length
    && Object.keys(value).every((key) => CAPABILITIES.includes(key))
    && CAPABILITIES.every((key) => typeof value[key] === "boolean");
}

function consentView(value) {
  if (!value || value.version !== AI_CONSENT_VERSION || value.provider !== "cloudflare"
    || !validCapabilities(value.capabilities) || !Number.isSafeInteger(value.revision) || value.revision < 1) return null;
  const capabilities = Object.fromEntries(CAPABILITIES.map(key => [key, AI_FEATURES[key] === true && value.capabilities[key] === true]));
  return { version: value.version, provider: value.provider, capabilities,
    grantedAt: value.grantedAt ?? null, revokedAt: value.revokedAt ?? null, revision: value.revision,
    automaticSpecies: false, automaticSpeciesFrom: null };
}

function parseRequest(req) {
  const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  if (!raw || encode.encode(raw).length > 2048) throw failure("invalid_request", 400);
  const body = JSON.parse(raw);
  if (!body || typeof body !== "object" || Array.isArray(body) || !ACTIONS.includes(body.action)) throw failure("invalid_request", 400);
  const allowed = body.action === "consent.update" ? ["action", "version", "expectedRevision", "capabilities", ...(Object.hasOwn(body, "automaticSpecies") ? ["automaticSpecies"] : [])]
    : body.action === "story" ? ["action", "catchId", "task"] : ["action"];
  if (Object.keys(body).length !== allowed.length || Object.keys(body).some((key) => !allowed.includes(key))) throw failure("invalid_request", 400);
  if ((body.action === "story") && (typeof body.catchId !== "string" || !ID.test(body.catchId))) throw failure("invalid_request", 400);
  if (body.action === "story" && !TASKS.includes(body.task)) throw failure("invalid_request", 400);
  if (body.action === "consent.update" && (body.version !== AI_CONSENT_VERSION || !validCapabilities(body.capabilities)
    || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0
    || (Object.hasOwn(body, "automaticSpecies") && typeof body.automaticSpecies !== "boolean"))) throw failure("invalid_request", 400);
  return body;
}

function validateAnalysisOutput(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)
    || Object.keys(output).some((key) => !["text", "evidenceKeys"].includes(key))
    || typeof output.text !== "string" || !output.text.trim() || encode.encode(output.text).length > 8000
    || !Array.isArray(output.evidenceKeys) || !output.evidenceKeys.length || output.evidenceKeys.length > EVIDENCE_KEYS.length
    || output.evidenceKeys.some((key) => !EVIDENCE_KEYS.includes(key))) throw failure("invalid_ai_response", 503);
  return { text: output.text.trim(), evidenceKeys: [...new Set(output.evidenceKeys)] };
}

function boundedSummary(summary) {
  // Preserve deterministic counts while bounding custom labels and cardinality;
  // never forward arbitrary full notes hidden in a custom method/bait key.
  const counts = (value) => {
    const entries = Object.entries(value).filter(([, count]) => Number.isSafeInteger(count) && count > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const kept = entries.filter(([key]) => /^[A-Za-z0-9_-]{1,64}$/.test(key)).slice(0, 80);
    const other = entries.reduce((sum, [key, count]) => sum + (kept.some(([included]) => included === key) ? 0 : count), 0);
    return { ...Object.fromEntries(kept), ...(other ? { other: (kept.find(([key]) => key === "other")?.[1] ?? 0) + other } : {}) };
  };
  const result = { ...summary, species: counts(summary.species), hours: counts(summary.hours), months: counts(summary.months),
    methods: counts(summary.methods), baits: counts(summary.baits) };
  if (encode.encode(JSON.stringify(result)).length > 24_000) throw failure("journal_unavailable", 503);
  return result;
}

// All provider functions are injected. Production must pass reviewed source flags
// and the already verified zero-cost provider configuration; nothing activates here.
export function createAiApplicationApi({ enabled = false, features = AI_FEATURES, providerName = "cloudflare", modelId,
  verifyToken, getConsent, setConsent, getOwnedCatch, listOwnedCatches,
  getCachedResult, saveResult, consumeRateLimit, textProvider, analysisProvider,
  claimRequest, finishRequest,
  authorizeRuntime, recordInference, settleRateLimit, getQuotaPolicy,
  diagnostic = safeAiDiagnostic, now = () => Date.now() } = {}) {
  const observeInference = async outcome => { try { await recordInference?.(outcome); } catch { /* Best-effort operational aggregate only. */ } };
  const checkConsent = async (uid, capability, expectedRevision = null) => {
    if (authorizeRuntime && !await authorizeRuntime(uid, capability)) throw failure("ai_disabled", 503);
    const consent = await getConsent(uid);
    if (consent?.ownerId !== uid || !consentView(consent) || !hasAiConsent(consent, capability, providerName)
      || (expectedRevision !== null && consent.revision !== expectedRevision)) throw failure("consent_required", 403);
    return consent;
  };
  return async (req, res) => {
    if (req.method !== "POST") { res.setHeader?.("Allow", "POST"); return send(res, 405, { error: "method_not_allowed" }); }
    if (!enabled || providerName !== "cloudflare" || typeof modelId !== "string" || !modelId
      || ![verifyToken, getConsent, setConsent].every((fn) => typeof fn === "function")) return send(res, 503, { error: "ai_disabled" });
    let body;
    try { body = parseRequest(req); } catch { return send(res, 400, { error: "invalid_request" }); }
    const token = typeof req.headers?.authorization === "string" ? req.headers.authorization.match(/^Bearer ([^\s]+)$/)?.[1] : null;
    if (!token) return send(res, 401, { error: "authentication_required" });
    let uid;
    try { uid = (await verifyToken(token))?.uid; } catch { return send(res, 401, { error: "authentication_required" }); }
    if (typeof uid !== "string" || !ID.test(uid)) return send(res, 401, { error: "authentication_required" });
    let leaseKey = null, leaseTicket = null, inferenceCapability = null, inferenceRecorded = false;
    try {
      if (body.action === "consent.get") {
        const consent = await getConsent(uid);
        return send(res, 200, { consent: consent?.ownerId === uid ? consentView(consent) : null, ...(getQuotaPolicy ? { quotaPolicyVersion: await getQuotaPolicy(uid) } : {}) });
      }
      if (["consent.update", "consent.revoke"].includes(body.action)) {
        const value = await setConsent(uid, body.action === "consent.revoke" ? { revoke: true }
          : { version: body.version, capabilities: body.capabilities, expectedRevision: body.expectedRevision,
            ...(Object.hasOwn(body, "automaticSpecies") ? { automaticSpecies: body.automaticSpecies } : {}) });
        return send(res, 200, { consent: consentView(value), ...(value.cleanupPending ? { cleanupPending: true } : {}) });
      }
      const capability = body.action === "story" ? "stories" : body.action;
      const provider = capability === "stories" ? textProvider : analysisProvider;
      if (features[capability] !== true || typeof provider !== "function"
        || ![consumeRateLimit, getCachedResult, saveResult].every((fn) => typeof fn === "function")) throw failure("ai_disabled", 503);
      const consent = await checkConsent(uid, capability);
      let result, sourceHash, source;
      if (capability === "stories") {
        if (typeof getOwnedCatch !== "function") throw failure("ai_disabled", 503);
        source = await getOwnedCatch(uid, body.catchId);
        if (!own(source, uid, body.catchId)) throw failure("catch_not_found", 404);
        if (typeof source.notes !== "string" || !source.notes.trim() || encode.encode(source.notes).length > 12_000) throw failure("unsupported_notes", 422);
        sourceHash = hash([body.catchId, body.task, source.notes]);
      } else {
        if (typeof listOwnedCatches !== "function") throw failure("ai_disabled", 503);
        const collection = await listOwnedCatches(uid);
        if (!collection || !Array.isArray(collection.records) || collection.records.length > 500) throw failure("journal_unavailable", 503);
        const records = collection.records.filter((record) => own(record, uid, record.id));
        const analysis = analyzeDiary(records);
        analysis.providerSummary = boundedSummary(analysis.providerSummary);
        source = { ...analysis, truncated: collection.truncated === true };
        if (!analysis.providerSummary.count) throw failure("insufficient_data", 422);
        sourceHash = hash([analysis.providerSummary, analysis.evidenceIds, source.truncated]);
      }
      const key = hash(["ai-v1", capability, modelId, sourceHash]);
      const cached = await getCachedResult(uid, key);
      if (cached?.ownerId === uid && cached.type === body.action && cached.provider === providerName
        && cached.modelId === modelId && cached.sourceHash === sourceHash && cached.consentRevision === consent.revision) {
        await checkConsent(uid, capability, consent.revision);
        if (capability === "stories") {
          createStoryDraft(source.notes, cached.result?.text, body.task);
          return send(res, 200, { ...cached.result, originalNotes: source.notes, sourceNotes: source.notes,
            baseRevision: source.serverRevision ?? null });
        }
        const validated = validateAnalysisOutput({ text: cached.result?.text, evidenceKeys: cached.result?.evidenceKeys });
        return send(res, 200, { ...cached.result, ...validated });
      }
      // Consent and source authority are checked before quota consumption. Cache
      // hits never consume another inference reservation.
      await checkConsent(uid, capability, consent.revision);
      if (claimRequest) {
        leaseKey = key;
        leaseTicket = await claimRequest(uid, key, { consentRevision: consent.revision,
          ...(getQuotaPolicy ? { policyVersion: await getQuotaPolicy(uid) } : {}) });
      }
      const quota = await consumeRateLimit(uid, { capability });
      if (quota !== true && quota?.allowed !== true) throw new AiServiceError(quota?.code ?? "quota_unavailable", { retryAt: quota?.retryAt });
      await checkConsent(uid, capability, consent.revision);
      let measuredUsage = null;
      const onUsage = value => { measuredUsage = value; };
      inferenceCapability = capability;
      if (capability === "stories") {
        const output = await provider({ notes: source.notes, action: body.task, onUsage });
        result = { ...createStoryDraft(source.notes, output?.text, body.task), task: body.task, catchId: body.catchId,
          sourceNotes: source.notes, baseRevision: source.serverRevision ?? null };
      } else {
        // No notes, GPS, photo URLs, water names or evidence IDs reach the model.
        const output = validateAnalysisOutput(await provider({ task: body.action, summary: source.providerSummary, onUsage }));
        result = { ...output, status: "generated", isHypothesis: true, requiresFactReview: true,
          summary: source.providerSummary, evidenceIds: source.evidenceIds, truncated: source.truncated,
          limitations: ["Popis zapsaných úlovků; nezahrnuje dobu lovu ani neúspěšné vycházky.",
            ...(source.providerSummary.count < 10 ? ["Malý vzorek: závěry jsou pouze orientační."] : []),
            ...(source.truncated ? ["Zpracováno nejvýše 500 posledních synchronizovaných úlovků."] : [])] };
      }
      await observeInference({ capability, status: "success" });
      inferenceRecorded = true;
      await checkConsent(uid, capability, consent.revision);
      const stored = await saveResult(uid, key, { ownerId: uid, type: body.action, provider: providerName, modelId, sourceHash,
        ...(body.catchId ? { catchId: body.catchId } : {}), result },
      { capability, consentRevision: consent.revision,
        ...(source?.notes !== undefined ? { expectedNotes: source.notes } : {}) });
      if (!stored) throw failure("source_changed", 409);
      if (quota?.reservationId && measuredUsage && settleRateLimit) {
        try { await settleRateLimit(uid, quota.reservationId, measuredUsage); } catch { /* Keep the full reservation on uncertainty. */ }
      }
      if (leaseTicket) await finishRequest?.(uid, leaseKey, leaseTicket).catch(() => {});
      return send(res, 200, result);
    } catch (caught) {
      const error = caught instanceof TypeError ? new AiServiceError("invalid_ai_response") : caught;
      if (inferenceCapability && !inferenceRecorded) await observeInference({ capability: inferenceCapability, status: "error", code: error?.aiCode });
      if (leaseTicket) await finishRequest?.(uid, leaseKey, leaseTicket, { code: error.aiCode ?? "unavailable",
        retryAt: error.retryAt ?? new Date(now() + 5 * 60_000).toISOString() }).catch(() => {});
      diagnostic(error);
      if (error instanceof AiServiceError) return send(res, error.aiStatus, { error: error.aiCode, ...(error.retryAt ? { retryAt: error.retryAt } : {}) });
      const known = ["invalid_request", "consent_conflict", "consent_required", "ai_disabled",
        "catch_not_found", "unsupported_notes", "journal_unavailable", "insufficient_data", "rate_limited", "invalid_ai_response", "source_changed", "account_unavailable"];
      return send(res, known.includes(error?.aiCode) ? error.aiStatus : 503,
        { error: known.includes(error?.aiCode) ? error.aiCode : "ai_unavailable" });
    }
  };
}

export function createFirebaseAiApplicationDependencies({ env, admin = () => getAccountDeletionAdminContext(env), now = () => Date.now() } = {}) {
  const requireIdentity = (uid) => { if (typeof uid !== "string" || !ID.test(uid)) throw failure("account_unavailable", 403); };
  const getConsent = async (uid) => {
    requireIdentity(uid);
    const { db } = await admin();
    const [deleted, snapshot] = await Promise.all([db.doc(`accountDeletions/${uid}`).get(), db.doc(`users/${uid}/aiPreferences/consent`).get()]);
    if (deleted.exists) throw failure("account_unavailable", 403);
    const consent = snapshot.exists ? snapshot.data() : null;
    return consent?.ownerId === uid ? consent : null;
  };
  return {
    getConsent,
    setConsent: async (uid, values) => {
      requireIdentity(uid);
      const { db } = await admin();
      const ref = db.doc(`users/${uid}/aiPreferences/consent`);
      const updated = await db.runTransaction(async (transaction) => {
        const [deleted, current] = await Promise.all([transaction.get(db.doc(`accountDeletions/${uid}`)), transaction.get(ref)]);
        if (deleted.exists) throw failure("account_unavailable", 403);
        const previous = current.exists ? current.data() : null;
        if (previous && previous.ownerId !== uid) throw failure("account_unavailable", 403);
        const revision = Number.isSafeInteger(previous?.revision) ? previous.revision : 0;
        if (!values.revoke && (values.version !== AI_CONSENT_VERSION || !validCapabilities(values.capabilities)
          || values.expectedRevision !== revision)) throw failure("consent_conflict", 409);
        const capabilities = Object.fromEntries(CAPABILITIES.map((key) => [key,
          !values.revoke && AI_FEATURES[key] === true && values.capabilities[key] === true]));
        const granted = CAPABILITIES.some((key) => capabilities[key]);
        const timestamp = new Date(now()).toISOString();
        const consent = { ownerId: uid, version: AI_CONSENT_VERSION, provider: "cloudflare", capabilities,
          grantedAt: granted ? timestamp : previous?.grantedAt ?? null, revokedAt: granted ? null : timestamp,
          revision: revision + 1, updatedAt: timestamp,
          automaticSpecies: false, automaticSpeciesFrom: null };
        transaction.set(ref, consent);
        return consent;
      });
      // Revision is committed first. Late provider responses cannot write a
      // result under a revoked/changed consent even while cleanup is running.
      // Any consent revision invalidates the older cache, including revoking a
      // single capability while other capabilities stay enabled.
      {
        try {
          while (true) {
            const page = await db.collection(`users/${uid}/aiResults`).where("consentRevision", "<", updated.revision).limit(200).get();
            if (page.empty) break;
            const batch = db.batch();
            for (const result of page.docs) batch.delete(result.ref);
            await batch.commit();
          }
        } catch { return { ...updated, cleanupPending: true }; }
      }
      return updated;
    },
    getOwnedCatch: async (uid, catchId) => {
      requireIdentity(uid);
      if (!ID.test(catchId)) return null;
      const { db } = await admin();
      const [deleted, snapshot] = await Promise.all([db.doc(`accountDeletions/${uid}`).get(), db.doc(`users/${uid}/catches/${catchId}`).get()]);
      if (deleted.exists) throw failure("account_unavailable", 403);
      const record = snapshot.exists ? snapshot.data() : null;
      return own(record, uid, catchId) ? record : null;
    },
    listOwnedCatches: async (uid) => {
      requireIdentity(uid);
      const { db } = await admin();
      if ((await db.doc(`accountDeletions/${uid}`).get()).exists) throw failure("account_unavailable", 403);
      const snapshot = await db.collection(`users/${uid}/catches`).orderBy("caughtAt", "desc").limit(501).get();
      return { records: snapshot.docs.slice(0, 500).map((doc) => doc.data()).filter((record) => own(record, uid, record.id)), truncated: snapshot.size > 500 };
    },
    getCachedResult: async (uid, key) => {
      requireIdentity(uid);
      if (!SHA.test(key)) return null;
      const { db } = await admin();
      const [deleted, snapshot] = await Promise.all([db.doc(`accountDeletions/${uid}`).get(), db.doc(`users/${uid}/aiResults/${key}`).get()]);
      if (deleted.exists) throw failure("account_unavailable", 403);
      const result = snapshot.exists ? snapshot.data() : null;
      return result?.ownerId === uid ? result : null;
    },
    saveResult: async (uid, key, entry, { capability, consentRevision, expectedNotes } = {}) => {
      requireIdentity(uid);
      if (!SHA.test(key) || entry.ownerId !== uid || !AI_FEATURES[capability]) return false;
      const { db } = await admin();
      return db.runTransaction(async (transaction) => {
        const [deleted, consentSnapshot, account, config, suspended] = await Promise.all([transaction.get(db.doc(`accountDeletions/${uid}`)),
          transaction.get(db.doc(`users/${uid}/aiPreferences/consent`)), transaction.get(db.doc(`adminAccounts/${uid}`)),
          transaction.get(db.doc("adminConfig/runtime")), transaction.get(db.doc(`accountSuspensions/${uid}`))]);
        const consent = consentSnapshot.exists ? consentSnapshot.data() : null;
        const access = resolveAccess(uid, account.exists ? account.data() : {}, configuredOwnerUid(env), now(), configuredCoCreatorUid(env));
        const runtime = normalizeRuntimeConfig(config.exists ? config.data() : {});
        if (deleted.exists || suspended.exists || !isRuntimeFeatureEnabled(capability, access, runtime)
          || effectiveUserReservation(access, runtime) === 0 || consent?.ownerId !== uid || consent.revision !== consentRevision || !hasAiConsent(consent, capability, "cloudflare")) return false;
        if (entry.catchId) {
          if (!ID.test(entry.catchId)) return false;
          const snapshot = await transaction.get(db.doc(`users/${uid}/catches/${entry.catchId}`));
          const record = snapshot.exists ? snapshot.data() : null;
          if (!own(record, uid, entry.catchId) || (expectedNotes !== undefined && record.notes !== expectedNotes)) return false;
        }
        transaction.set(db.doc(`users/${uid}/aiResults/${key}`), { ...entry, consentRevision, createdAt: new Date(now()).toISOString() });
        return true;
      });
    },
  };
}
