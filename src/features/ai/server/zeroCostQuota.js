import { createHash } from "node:crypto";

// Reservations are deliberately conservative application limits, not provider
// token metering or proof of the account's billing plan. Workers Free's enforced
// daily ceiling is the actual zero-spend boundary. Never refund failed requests:
// a timeout may happen after Cloudflare has consumed inference resources.
export const ZERO_COST_AI_LIMITS = Object.freeze({ globalDailyReservation: 7500,
  perUserDailyReservation: 2500, requestReservation: 2500 });
const DAY = 86_400_000;

function reservedForDay(snapshot, day) {
  if (!snapshot.exists) return 0;
  const data = snapshot.data();
  if (!Number.isSafeInteger(data?.dayUtc) || data.dayUtc > day) return null;
  if (data.dayUtc < day) return 0;
  return Number.isSafeInteger(data.reservedNeurons) && data.reservedNeurons >= 0 ? data.reservedNeurons : null;
}

export function createZeroCostQuota({ db, Timestamp, now = () => Date.now(),
  globalDailyReservation = ZERO_COST_AI_LIMITS.globalDailyReservation,
  perUserDailyReservation = ZERO_COST_AI_LIMITS.perUserDailyReservation } = {}) {
  if (typeof db?.runTransaction !== "function" || typeof db?.doc !== "function" || typeof Timestamp?.fromMillis !== "function"
    || !Number.isInteger(globalDailyReservation) || globalDailyReservation < 1 || globalDailyReservation > ZERO_COST_AI_LIMITS.globalDailyReservation
    || !Number.isInteger(perUserDailyReservation) || perUserDailyReservation < 1 || perUserDailyReservation > ZERO_COST_AI_LIMITS.perUserDailyReservation) {
    throw new TypeError("Invalid zero-cost AI quota configuration.");
  }
  return async (uid) => {
    if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return false;
    const time = now();
    if (!Number.isSafeInteger(time) || time < 0) return false;
    const day = Math.floor(time / DAY);
    const amount = ZERO_COST_AI_LIMITS.requestReservation;
    const globalRef = db.doc("serverRateLimits/ai-free-cloudflare-global");
    const userRef = db.doc(`serverRateLimits/ai-free-cloudflare-user-${createHash("sha256").update(uid).digest("hex")}`);
    try {
      return await db.runTransaction(async (transaction) => {
        // All reads precede writes. The global and per-user allowance are
        // consumed together, including requests from concurrent app instances.
        const [globalSnapshot, userSnapshot] = await Promise.all([transaction.get(globalRef), transaction.get(userRef)]);
        const blockedDay = globalSnapshot.exists ? globalSnapshot.data()?.blockedDay : undefined;
        if (blockedDay !== undefined && (!Number.isSafeInteger(blockedDay) || blockedDay >= day)) return false;
        const globalReserved = reservedForDay(globalSnapshot, day);
        const userReserved = reservedForDay(userSnapshot, day);
        if (globalReserved === null || userReserved === null
          || globalReserved + amount > globalDailyReservation || userReserved + amount > perUserDailyReservation) return false;
        const common = { dayUtc: day, expiresAt: Timestamp.fromMillis((day + 2) * DAY) };
        transaction.set(globalRef, { ...common, reservedNeurons: globalReserved + amount });
        transaction.set(userRef, { ...common, reservedNeurons: userReserved + amount });
        return true;
      });
    } catch { return false; }
  };
}

export async function blockZeroCostQuota({ db, Timestamp, now = () => Date.now() } = {}) {
  const time = now();
  if (typeof db?.runTransaction !== "function" || typeof db?.doc !== "function" || typeof Timestamp?.fromMillis !== "function"
    || !Number.isSafeInteger(time) || time < 0) return false;
  const day = Math.floor(time / DAY);
  const ref = db.doc("serverRateLimits/ai-free-cloudflare-global");
  try {
    return await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const reserved = reservedForDay(snapshot, day);
      if (reserved === null) return false;
      transaction.set(ref, { dayUtc: day, reservedNeurons: reserved, blockedDay: day,
        expiresAt: Timestamp.fromMillis((day + 2) * DAY) });
      return true;
    });
  } catch { return false; }
}
