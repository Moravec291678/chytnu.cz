import { createHash } from "node:crypto";
import { AI_CONSENT_VERSION, AI_FEATURES, hasAiConsent } from "../aiPolicy.js";
import { analyzeDiary } from "../diaryAnalysis.js";
import { createStoryDraft } from "../storyDraft.js";
import { validateSpeciesSuggestion } from "../speciesSuggestion.js";
import { getAccountDeletionAdminContext } from "../../../server/cloudinaryApi.js";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const SHA = /^[a-f0-9]{64}$/;
const CAPABILITIES = ["species", "stories", "diary", "recommendations"];
const TASKS = ["summarize", "improve", "clarity", "title"];
const ACTIONS = ["consent.get", "consent.update", "consent.revoke", "species", "story", "diary", "recommendations"];
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
  return { version: value.version, provider: value.provider, capabilities: value.capabilities,
    grantedAt: value.grantedAt ?? null, revokedAt: value.revokedAt ?? null, revision: value.revision };
}

function parseRequest(req) {
  const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  if (!raw || encode.encode(raw).length > 2048) throw failure("invalid_request", 400);
  const body = JSON.parse(raw);
  if (!body || typeof body !== "object" || Array.isArray(body) || !ACTIONS.includes(body.action)) throw failure("invalid_request", 400);
  const allowed = body.action === "consent.update" ? ["action", "version", "expectedRevision", "capabilities"]
    : body.action === "species" ? ["action", "catchId", "photoId"]
      : body.action === "story" ? ["action", "catchId", "task"] : ["action"];
  if (Object.keys(body).length !== allowed.length || Object.keys(body).some((key) => !allowed.includes(key))) throw failure("invalid_request", 400);
  if (["species", "story"].includes(body.action) && (typeof body.catchId !== "string" || !ID.test(body.catchId))) throw failure("invalid_request", 400);
  if (body.action === "species" && (typeof body.photoId !== "string" || !ID.test(body.photoId))) throw failure("invalid_request", 400);
  if (body.action === "story" && !TASKS.includes(body.task)) throw failure("invalid_request", 400);
  if (body.action === "consent.update" && (body.version !== AI_CONSENT_VERSION || !validCapabilities(body.capabilities)
    || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0)) throw failure("invalid_request", 400);
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
  verifyToken, getConsent, setConsent, getOwnedPhoto, getOwnedCatch, listOwnedCatches,
  getCachedResult, saveResult, consumeRateLimit, speciesProvider, textProvider, analysisProvider } = {}) {
  const checkConsent = async (uid, capability, expectedRevision = null) => {
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
    try {
      if (body.action === "consent.get") {
        const consent = await getConsent(uid);
        return send(res, 200, { consent: consent?.ownerId === uid ? consentView(consent) : null });
      }
      if (["consent.update", "consent.revoke"].includes(body.action)) {
        const value = await setConsent(uid, body.action === "consent.revoke" ? { revoke: true }
          : { version: body.version, capabilities: body.capabilities, expectedRevision: body.expectedRevision });
        return send(res, 200, { consent: consentView(value), ...(value.cleanupPending ? { cleanupPending: true } : {}) });
      }
      const capability = body.action === "story" ? "stories" : body.action;
      const provider = capability === "species" ? speciesProvider : capability === "stories" ? textProvider : analysisProvider;
      if (features[capability] !== true || typeof provider !== "function"
        || ![consumeRateLimit, getCachedResult, saveResult].every((fn) => typeof fn === "function")) throw failure("ai_disabled", 503);
      const consent = await checkConsent(uid, capability);
      let result, sourceHash, source, photo;
      if (capability === "species") {
        if (typeof getOwnedPhoto !== "function") throw failure("ai_disabled", 503);
        photo = await getOwnedPhoto(uid, body.catchId, body.photoId);
        if (photo?.ownerId !== uid || photo.catchId !== body.catchId || photo.photoId !== body.photoId || photo.deleted) throw failure("photo_not_found", 404);
        if (!(photo.bytes instanceof Uint8Array) || !photo.bytes.length || photo.bytes.length > 2 * 1024 * 1024
          || photo.metadataStripped !== true || !["image/jpeg", "image/png", "image/webp"].includes(photo.mimeType)
          || !SHA.test(photo.sourceSha256 ?? "")) throw failure("unsupported_photo", 422);
        sourceHash = hash([body.catchId, body.photoId, photo.sourceSha256]);
      } else if (capability === "stories") {
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
        if (capability === "species") return send(res, 200, { ...validateSpeciesSuggestion(cached.result), sourceSha256: photo.sourceSha256 });
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
      if (!await consumeRateLimit(uid)) throw failure("rate_limited", 429);
      await checkConsent(uid, capability, consent.revision);
      if (capability === "species") result = validateSpeciesSuggestion(await provider({ bytes: photo.bytes, mimeType: photo.mimeType }));
      else if (capability === "stories") {
        const output = await provider({ notes: source.notes, action: body.task });
        result = { ...createStoryDraft(source.notes, output?.text, body.task), task: body.task, catchId: body.catchId,
          sourceNotes: source.notes, baseRevision: source.serverRevision ?? null };
      } else {
        // No notes, GPS, photo URLs, water names or evidence IDs reach the model.
        const output = validateAnalysisOutput(await provider({ task: body.action, summary: source.providerSummary }));
        result = { ...output, status: "generated", isHypothesis: true, requiresFactReview: true,
          summary: source.providerSummary, evidenceIds: source.evidenceIds, truncated: source.truncated,
          limitations: ["Popis zapsaných úlovků; nezahrnuje dobu lovu ani neúspěšné vycházky.",
            ...(source.providerSummary.count < 10 ? ["Malý vzorek: závěry jsou pouze orientační."] : []),
            ...(source.truncated ? ["Zpracováno nejvýše 500 posledních synchronizovaných úlovků."] : [])] };
      }
      await checkConsent(uid, capability, consent.revision);
      const stored = await saveResult(uid, key, { ownerId: uid, type: body.action, provider: providerName, modelId, sourceHash,
        ...(body.catchId ? { catchId: body.catchId } : {}), ...(body.photoId ? { photoId: body.photoId, photoSha256: photo.sourceSha256 } : {}), result },
      { capability, consentRevision: consent.revision, ...(source?.notes !== undefined ? { expectedNotes: source.notes } : {}) });
      if (!stored) throw failure("source_changed", 409);
      return send(res, 200, capability === "species" ? { ...result, sourceSha256: photo.sourceSha256 } : result);
    } catch (error) {
      const known = ["invalid_request", "consent_conflict", "consent_required", "ai_disabled", "photo_not_found", "unsupported_photo",
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
        const capabilities = values.revoke ? Object.fromEntries(CAPABILITIES.map((key) => [key, false])) : values.capabilities;
        const granted = CAPABILITIES.some((key) => capabilities[key]);
        const timestamp = new Date(now()).toISOString();
        const consent = { ownerId: uid, version: AI_CONSENT_VERSION, provider: "cloudflare", capabilities,
          grantedAt: granted ? timestamp : previous?.grantedAt ?? null, revokedAt: granted ? null : timestamp,
          revision: revision + 1, updatedAt: timestamp };
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
      if (!SHA.test(key) || entry.ownerId !== uid || !CAPABILITIES.includes(capability)) return false;
      const { db } = await admin();
      return db.runTransaction(async (transaction) => {
        const [deleted, consentSnapshot] = await Promise.all([transaction.get(db.doc(`accountDeletions/${uid}`)),
          transaction.get(db.doc(`users/${uid}/aiPreferences/consent`))]);
        const consent = consentSnapshot.exists ? consentSnapshot.data() : null;
        if (deleted.exists || consent?.ownerId !== uid || consent.revision !== consentRevision || !hasAiConsent(consent, capability, "cloudflare")) return false;
        if (entry.catchId) {
          if (!ID.test(entry.catchId)) return false;
          const snapshot = await transaction.get(db.doc(`users/${uid}/catches/${entry.catchId}`));
          const record = snapshot.exists ? snapshot.data() : null;
          if (!own(record, uid, entry.catchId) || (expectedNotes !== undefined && record.notes !== expectedNotes)) return false;
          if (entry.photoId) {
            if (!ID.test(entry.photoId) || record.photoRefs?.[entry.photoId] !== true) return false;
            const photoSnapshot = await transaction.get(db.doc(`users/${uid}/catches/${entry.catchId}/photos/${entry.photoId}`));
            const photo = photoSnapshot.exists ? photoSnapshot.data() : null;
            if (!photo || photo.deleted || photo.id !== entry.photoId || photo.cloud?.state !== "synced"
              || photo.cloud.sha256 !== entry.photoSha256) return false;
          }
        }
        transaction.set(db.doc(`users/${uid}/aiResults/${key}`), { ...entry, consentRevision, createdAt: new Date(now()).toISOString() });
        return true;
      });
    },
  };
}
