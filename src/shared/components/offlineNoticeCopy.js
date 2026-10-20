export function getOfflineNoticeCopy(status, pending = 0) {
  const safePending = Number.isFinite(pending) && pending > 0 ? Math.floor(pending) : 0;
  if (status === "error") {
    return { title: "Synchronizace se nezdařila", description: `Lokální úlovky a výpravy zůstávají uložené. Čekající změny: ${safePending}.`, retryLabel: "Zkusit synchronizaci znovu" };
  }
  if (safePending > 0) {
    return { title: "Bez připojení", description: `Úlovky a výpravy můžeš dál zapisovat. ${safePending} změn čeká ve frontě; synchronizace se zkusí po obnovení připojení.`, retryLabel: "Zkontrolovat připojení" };
  }
  return { title: "Bez připojení", description: "Úlovky a výpravy můžeš dál ukládat do tohoto zařízení.", retryLabel: "Zkontrolovat připojení" };
}
