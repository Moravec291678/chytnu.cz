export function getOfflineNoticeCopy(status, pending = 0, errorCode = "") {
  const safePending = Number.isFinite(pending) && pending > 0 ? Math.floor(pending) : 0;
  if (status === "error") {
    if (errorCode === "permission_denied") {
      return { title: "Synchronizace nebyla povolena serverem", description: `Místní data zůstávají uložená. Čekající změny: ${safePending}.`, retryLabel: "Zkusit synchronizaci znovu" };
    }
    if (errorCode === "unavailable") {
      return { title: "Synchronizace čeká na připojení", description: `Místní data zůstávají uložená. Čekající změny: ${safePending}.`, retryLabel: "Zkusit synchronizaci znovu" };
    }
    return { title: "Synchronizace se nezdařila", description: `Lokální úlovky a vycházky zůstávají uložené. Čekající změny: ${safePending}.`, retryLabel: "Zkusit synchronizaci znovu" };
  }
  if (safePending > 0) {
    return { title: "Bez připojení", description: `Úlovky a vycházky můžeš dál zapisovat. ${safePending} změn čeká ve frontě; synchronizace se zkusí po obnovení připojení.`, retryLabel: "Zkontrolovat připojení" };
  }
  return { title: "Bez připojení", description: "Úlovky a vycházky můžeš dál ukládat do tohoto zařízení.", retryLabel: "Zkontrolovat připojení" };
}
