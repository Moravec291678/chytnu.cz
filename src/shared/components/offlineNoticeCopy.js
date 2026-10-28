export function getOfflineNoticeCopy(status, pending = 0, errorCode = "") {
  const safePending = Number.isFinite(pending) && pending > 0 ? Math.floor(pending) : 0;
  if (status === "error") {
    if (errorCode === "permission_denied") {
      return { title: "Synchronizaci se nepodařilo povolit", description: `Místní data zůstávají uložená. Čekající změny: ${safePending}.`, retryLabel: "Zkusit znovu" };
    }
    if (errorCode === "unavailable") {
      return { title: "Čeká se na připojení", description: `Místní data zůstávají uložená. Čekající změny: ${safePending}.`, retryLabel: "Zkusit znovu" };
    }
    return { title: "Synchronizaci se nepodařilo dokončit", description: `Úlovky a vycházky zůstávají uložené. Čekající změny: ${safePending}.`, retryLabel: "Zkusit znovu" };
  }
  if (safePending > 0) {
    return { title: "Bez připojení", description: `Úlovky a vycházky můžeš dál zapisovat. ${safePending} změn se odešle po obnovení připojení.`, retryLabel: "Zkontrolovat připojení" };
  }
  return { title: "Bez připojení", description: "Úlovky a vycházky můžeš dál ukládat do tohoto zařízení.", retryLabel: "Zkontrolovat připojení" };
}
