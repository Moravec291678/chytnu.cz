import { useEffect, useState } from "react";
import "./PwaUpdateNotice.css";

export default function PwaUpdateNotice({ syncing = false }) {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const serviceWorker = globalThis.navigator?.serviceWorker;
    if (!serviceWorker) return undefined;
    let hadController = Boolean(serviceWorker.controller);
    const onControllerChange = () => {
      if (hadController) setAvailable(true);
      hadController = true;
    };
    serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  if (!available || dismissed) return null;
  const update = () => {
    if (syncing) return;
    const safeToReload = window.confirm("Před načtením nové verze ulož rozpracovaný úlovek a formuláře. Běžící synchronizaci nejdřív dokonči; fotografie čekající ve frontě zůstávají uložené místně. Načíst nyní?");
    if (safeToReload) window.location.reload();
  };
  return <div className="pwa-update-layer">
    <aside className="pwa-update-card" role="status" aria-live="polite" aria-atomic="true">
      <div><strong>Je dostupná nová verze</strong><p>Aktualizace nemaže místní deník ani fotografie.</p></div>
      <div className="pwa-update-actions">
        <button type="button" onClick={() => setDismissed(true)}>Později</button>
        <button type="button" disabled={syncing} onClick={update}>Načíst</button>
      </div>
    </aside>
  </div>;
}
