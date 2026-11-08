import { Link } from "react-router-dom";
import { suggestedSpeciesForDisplay } from "./automaticSpecies.js";

const LABELS = { waiting_photo: "Rozpoznávání čeká na nahrání fotografie", waiting_internet: "Rozpoznávání druhu čeká na připojení",
  running: "AI rozpoznává rybu…", deferred: "Rozpoznávání čeká na dostupnou bezplatnou kapacitu",
  unknown: "Druh se nepodařilo spolehlivě určit", unavailable: "Automatické rozpoznávání teď není dostupné",
  consent_required: "Automatické rozpoznávání není povolené", confirmed: "Druh byl ručně upraven" };
export default function AutomaticSpeciesStatus({ record, compact = false }) {
  if (record.captureMode !== "quick" || record.speciesKey || record.quickCatch?.provenance?.speciesKey === "manual") return null;
  const species = suggestedSpeciesForDisplay(record), state = record.aiRecognition;
  const proposal = species && { ...record.aiSpeciesSuggestion, expectedRevision: record.sync?.revision,
    expectedServerRevision: record.sync?.serverRevision ?? null, photoHash: record.aiSpeciesSuggestion.sourceSha256 };
  if (compact) return <span className="ai-species-caption">{species ? "Návrh AI · lze upravit" : LABELS[state?.status] ?? "Druh zatím neurčen"}</span>;
  return <section className="ai-species-status" aria-label="Rozpoznání druhu">
    {species ? <>
      <p><strong>{species.label}</strong> · Návrh AI — lze upravit</p>
      {species.latinName && <p><i>{species.latinName}</i></p>}
      <p>Nepotvrzený návrh se nepočítá jako určený druh do rekordů ani druhových statistik.</p>
      <Link to={`/catch/${encodeURIComponent(record.id)}/edit`} state={{ aiSpeciesSuggestion: proposal }}>Potvrdit nebo upravit druh</Link>
    </> : <p role={state?.status === "running" ? "status" : undefined}>{state?.message || LABELS[state?.status] || "Automatické rozpoznávání lze povolit v nastavení AI."}</p>}
    {!species && (!state || state.status === "consent_required") && <Link to="/settings">Nastavení automatického rozpoznávání</Link>}
    {state?.retryAt && Number.isFinite(Date.parse(state.retryAt)) && <p>Další pokus nejdříve {new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short", timeStyle: "short" }).format(new Date(state.retryAt))}. Úlovek už je uložený.</p>}
  </section>;
}
