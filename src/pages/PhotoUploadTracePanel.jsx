import { useEffect, useState } from "react";
import { readPhotoUploadTrace, subscribePhotoUploadTrace } from "../features/catches/data/photoUploadTrace.js";

export default function PhotoUploadTracePanel() {
  const [entries, setEntries] = useState(readPhotoUploadTrace);
  const [message, setMessage] = useState("");
  useEffect(() => subscribePhotoUploadTrace(() => setEntries(readPhotoUploadTrace())), []);
  const report = JSON.stringify({ version: 1, photoUploadTrace: entries }, null, 2);
  async function copy() {
    try { await navigator.clipboard.writeText(report); setMessage("Diagnostika zkopírována."); }
    catch { setMessage("Kopírování není dostupné. Označ a zkopíruj text výpisu."); }
  }
  return <details>
    <summary>Průběh nahrávání fotografií ({entries.length} událostí)</summary>
    <p>Posledních 250 událostí této relace, zachovaných po obnovení stránky. Pouze ID fotografií, časy, velikosti, formáty a stavy; bez souborů, URL a přihlašovacích údajů.</p>
    <button type="button" onClick={copy}>Kopírovat diagnostiku</button>
    {message && <p role="status">{message}</p>}
    <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: "24rem", overflow: "auto" }}>{report}</pre>
  </details>;
}
