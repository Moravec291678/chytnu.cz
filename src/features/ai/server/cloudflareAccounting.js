import { createHash } from "node:crypto";

// Cloudflare Gemma 4: 9091 neurons / M input, 27273 / M output tokens.
// Input includes vision tokens. Never estimate from JPEG bytes or refund an
// unsuccessful/unknown request. Keep the 2500 worst-context reservation in flight.
export function measuredNeurons(usage) {
  const input = usage?.prompt_tokens, output = usage?.completion_tokens;
  if (!Number.isSafeInteger(input) || input < 1 || input > 256000 || !Number.isSafeInteger(output) || output < 0 || output > 512
    || usage.total_tokens !== input + output) return null;
  return Math.ceil((input * 9091 + output * 27273) / 1000000);
}

export async function settleCloudflareReservation({ db, uid, reservationId, usage, now = Date.now() }) {
  const actual = measuredNeurons(usage);
  if (actual === null || !/^[A-Za-z0-9_-]{1,128}$/.test(uid ?? "") || !/^[a-f0-9-]{36}$/.test(reservationId ?? "")) return false;
  const userKey = `serverRateLimits/ai-free-cloudflare-user-${createHash("sha256").update(uid).digest("hex")}`;
  const day = Math.floor(now / 86400000);
  try {
    return await db.runTransaction(async tx => {
      const ticketRef = db.doc(`serverRateLimits/ai-reservation-${reservationId}`), globalRef = db.doc("serverRateLimits/ai-free-cloudflare-global"), userRef = db.doc(userKey);
      const [ticketDoc, globalDoc, userDoc] = await Promise.all([tx.get(ticketRef), tx.get(globalRef), tx.get(userRef)]);
      if (!ticketDoc.exists || !globalDoc.exists || !userDoc.exists) return false;
      const ticket = ticketDoc.data(), global = globalDoc.data(), user = userDoc.data();
      if (ticket.settled || ticket.userKey !== userKey || [ticket, global, user].some(row => row.dayUtc !== day)
        || !Number.isSafeInteger(ticket.amount) || actual > ticket.amount || ticket.amount > 2500) return false;
      const refund = ticket.amount - actual;
      const fields = ["reservedNeurons", ...(ticket.isText ? ["textReservedNeurons"] : []), ...(ticket.ordinary ? ["ordinaryReservedNeurons"] : [])];
      if (!Number.isSafeInteger(user.reservedNeurons) || user.reservedNeurons < refund
        || fields.some(key => !Number.isSafeInteger(global[key]) || global[key] < refund)) return false;
      tx.set(globalRef, { ...global, ...Object.fromEntries(fields.map(key => [key, global[key] - refund])) });
      tx.set(userRef, { ...user, reservedNeurons: user.reservedNeurons - refund });
      tx.set(ticketRef, { ...ticket, settled: true, measuredNeurons: actual });
      return true;
    });
  } catch { return false; } // Uncertain accounting keeps the full reservation.
}
