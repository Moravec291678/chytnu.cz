import { validateDataScope } from "../../auth/data/localDataScope.js";
import { openLocalDatabase, SERVER_PROGRESSION_CLAIM_STORE_NAME } from "../../catches/data/catchRepository.js";

function claimId(scopeKey, catchId) {
  return JSON.stringify([scopeKey, catchId]);
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Server progression claim se nepodařilo načíst."));
  });
}

function transactionDone(transaction, db) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Server progression frontu se nepodařilo uložit.")); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Zápis server progression fronty byl přerušen.")); };
  });
}

function requireAccountScope(options) {
  const scope = validateDataScope(options ?? {});
  if (!scope.ownerId) throw new TypeError("Server progression claim vyžaduje přihlášený účet.");
  return scope;
}

export const serverProgressionClaimRepository = {
  async enqueue(catchId, options, { onlyIfMissing = false, now = new Date().toISOString() } = {}) {
    if (typeof catchId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(catchId)) throw new TypeError("Catch ID není platné.");
    const scope = requireAccountScope(options);
    const id = claimId(scope.scopeKey, catchId);
    const db = await openLocalDatabase();
    const transaction = db.transaction(SERVER_PROGRESSION_CLAIM_STORE_NAME, "readwrite");
    const store = transaction.objectStore(SERVER_PROGRESSION_CLAIM_STORE_NAME);
    const existing = await requestValue(store.get(id));
    if (!existing || !onlyIfMissing) {
      store.put({
        ...(existing ?? {}),
        id, ownerId: scope.ownerId, scopeKey: scope.scopeKey, catchId,
        status: "pending", attemptCount: onlyIfMissing ? existing?.attemptCount ?? 0 : 0,
        nextAttemptAt: null, lastErrorCode: null,
        createdAt: existing?.createdAt ?? now, updatedAt: now,
        ...(onlyIfMissing ? {} : { completedAt: null, serverResult: null }),
      });
    }
    await transactionDone(transaction, db);
    return existing && onlyIfMissing ? existing : { ...(existing ?? {}), id, ownerId: scope.ownerId, scopeKey: scope.scopeKey, catchId, status: "pending" };
  },

  async list(ownerId) {
    const scope = requireAccountScope({ scopeKey: `account:${ownerId}`, ownerId });
    const db = await openLocalDatabase();
    try {
      const transaction = db.transaction(SERVER_PROGRESSION_CLAIM_STORE_NAME, "readonly");
      const rows = await requestValue(transaction.objectStore(SERVER_PROGRESSION_CLAIM_STORE_NAME).index("ownerId").getAll(ownerId));
      return rows.filter((row) => row.scopeKey === scope.scopeKey).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } finally { db.close(); }
  },

  async markSucceeded(catchId, ownerId, serverResult, now = new Date().toISOString()) {
    return this.update(catchId, ownerId, (row) => ({
      ...row, status: "succeeded", serverResult: {
        verificationLevel: serverResult.verificationLevel,
        eligible: Boolean(serverResult.eligible),
        xpAwarded: Number(serverResult.xpAwarded) || 0,
        totalCatchXp: Number(serverResult.totalCatchXp) || 0,
        eventIds: Array.isArray(serverResult.eventIds) ? serverResult.eventIds : [],
      }, completedAt: now, nextAttemptAt: null, lastErrorCode: null, updatedAt: now,
    }));
  },

  async markRetry(catchId, ownerId, errorCode, nowMs = Date.now()) {
    const now = new Date(nowMs).toISOString();
    return this.update(catchId, ownerId, (row) => {
      const attemptCount = (Number(row.attemptCount) || 0) + 1;
      const delay = Math.min(30 * 60_000, 1000 * 2 ** Math.min(attemptCount, 10));
      return { ...row, status: "pending", attemptCount, nextAttemptAt: new Date(nowMs + delay).toISOString(),
        lastErrorCode: typeof errorCode === "string" ? errorCode.slice(0, 80) : "network_error", updatedAt: now };
    });
  },

  async markBlocked(catchId, ownerId, errorCode, now = new Date().toISOString()) {
    return this.update(catchId, ownerId, (row) => ({ ...row, status: "blocked",
      lastErrorCode: typeof errorCode === "string" ? errorCode.slice(0, 80) : "invalid_claim", updatedAt: now }));
  },

  async remove(catchId, ownerId) {
    const scope = requireAccountScope({ scopeKey: `account:${ownerId}`, ownerId });
    const db = await openLocalDatabase();
    const transaction = db.transaction(SERVER_PROGRESSION_CLAIM_STORE_NAME, "readwrite");
    const store = transaction.objectStore(SERVER_PROGRESSION_CLAIM_STORE_NAME);
    const id = claimId(scope.scopeKey, catchId);
    const row = await requestValue(store.get(id));
    if (row?.ownerId === ownerId && row.scopeKey === scope.scopeKey) store.delete(id);
    await transactionDone(transaction, db);
    return Boolean(row?.ownerId === ownerId && row.scopeKey === scope.scopeKey);
  },

  async update(catchId, ownerId, updateRecord) {
    const scope = requireAccountScope({ scopeKey: `account:${ownerId}`, ownerId });
    const db = await openLocalDatabase();
    const transaction = db.transaction(SERVER_PROGRESSION_CLAIM_STORE_NAME, "readwrite");
    const store = transaction.objectStore(SERVER_PROGRESSION_CLAIM_STORE_NAME);
    const id = claimId(scope.scopeKey, catchId);
    const row = await requestValue(store.get(id));
    const updated = row?.ownerId === ownerId && row.scopeKey === scope.scopeKey ? updateRecord(row) : null;
    if (updated) store.put(updated);
    await transactionDone(transaction, db);
    return Boolean(updated);
  },
};
