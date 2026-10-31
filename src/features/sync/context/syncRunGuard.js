/** A read-only local summary may stall on a suspended/blocked IndexedDB connection. */
export function readWithDeadline(read, { timeoutMs = 15_000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer;
  return Promise.race([
    Promise.resolve().then(read),
    new Promise((_, reject) => { timer = setTimer(() => reject(Object.assign(new Error("Místní stav synchronizace se nepodařilo načíst včas."), { code: "unavailable" })), timeoutMs); }),
  ]).finally(() => clearTimer(timer));
}

/** Tickets invalidate older asynchronous UI snapshots, including an A → B → A account change. */
export function createLatestSyncSnapshot() {
  let revision = 0;
  return {
    next: () => ++revision,
    current: (ticket) => ticket === revision,
    invalidate: () => { revision += 1; },
  };
}
