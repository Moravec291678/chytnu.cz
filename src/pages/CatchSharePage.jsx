import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCatches } from "../features/catches/context/useCatches";
import { createCatchShareData, formatCatchShareText, getCatchShareFileName, shouldIncludeCatchWater } from "../features/catches/data/catchShare.js";
import { decodeSharePhoto, getSharePreviewFrameStyle, renderShareCard } from "../features/catches/data/catchShareCard.js";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { getCatchRarity } from "../features/catches/utils/rarity.js";
import { DEFAULT_SPECIES } from "../shared/constants/speciesCatalog.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import { progressionLedger } from "../features/progression/data/progressionLedger.js";
import { getEntitlementState } from "../features/entitlements/data/entitlementAccess.js";
import { getPrimaryAvailablePhoto } from "../features/catches/data/catchPhotos.js";
import { getPhotoBlobForDisplay } from "../features/catches/data/photoCloudService.js";
import "./ProgressionPages.css";

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long" }).format(new Date(value)) : "";
}

function formatMetric(value, maximumFractionDigits) {
  return Number.isFinite(value) ? value.toLocaleString("cs-CZ", { maximumFractionDigits }) : null;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function getPhotoBlob(photo, record, scope) {
  return getPhotoBlobForDisplay({ photo, ownerId: scope.ownerId, catchId: record.id, scopeKey: scope.scopeKey });
}

function CatchFishIcon() {
  return <svg className="catch-share-fish" viewBox="0 0 120 76" aria-hidden="true"><path d="M10 38C26 13 62 9 86 31L111 13V63L86 45C62 67 26 63 10 38Z" /><circle cx="70" cy="31" r="2.7" /></svg>;
}

export default function CatchSharePage() {
  const { id } = useParams();
  const { state, refresh } = useCatches();
  const scope = useDataScope();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [photoState, setPhotoState] = useState({ scopeKey: null, source: null, blob: null, url: "", status: "idle" });
  const [waterState, setWaterState] = useState({ scopeKey: null, catchId: null, water: null, status: "idle" });
  const record = state.catches.find((item) => item.id === id);
  const photo = record ? getPrimaryAvailablePhoto(record) : null;
  const photoMatchesScope = photoState.scopeKey === scope.scopeKey && photoState.source === photo;
  const displayedPhoto = photo && photoMatchesScope && photoState.status === "ready" ? photoState : null;
  const photoBroken = photo && photoMatchesScope && photoState.status === "broken";
  const photoLoading = Boolean(photo && !photoMatchesScope);
  const includeWater = shouldIncludeCatchWater(record);
  const waterMatchesScope = waterState.scopeKey === scope.scopeKey && waterState.catchId === record?.id;
  const waterLoading = includeWater && !waterMatchesScope;
  const waterUnavailable = includeWater && waterMatchesScope && waterState.status === "error";
  const savedWater = waterMatchesScope && waterState.status === "ready" ? waterState.water : null;
  const rarity = record ? getCatchRarity(record, DEFAULT_SPECIES) : null;
  let shareData = null;
  let shareDataError = "";

  useEffect(() => {
    if (!photo || !record) return undefined;
    let active = true;
    let objectUrl = "";
    const load = async () => {
      try {
        const blob = await getPhotoBlob(photo, record, scope);
        const decoded = await decodeSharePhoto(blob);
        decoded?.close?.();
        objectUrl = URL.createObjectURL(blob);
        if (active) setPhotoState({ scopeKey: scope.scopeKey, source: photo, blob, url: objectUrl, status: "ready" });
        else URL.revokeObjectURL(objectUrl);
      } catch {
        if (active) setPhotoState({ scopeKey: scope.scopeKey, source: photo, blob: null, url: "", status: "broken" });
      }
    };
    void load();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, photo, record, scope]);

  useEffect(() => {
    if (!record || !includeWater || scope.status !== "ready") return undefined;
    let active = true;
    waterRepository.get(record.waterId, scope).then((water) => {
      if (active) setWaterState({ scopeKey: scope.scopeKey, catchId: record.id, water, status: "ready" });
    }).catch(() => {
      if (active) setWaterState({ scopeKey: scope.scopeKey, catchId: record.id, water: null, status: "error" });
    });
    return () => { active = false; };
  }, [record, includeWater, scope]);

  if (record && !waterLoading) {
    try { shareData = createCatchShareData(record, savedWater); }
    catch (shareError) { shareDataError = shareError.message || "Údaje úlovku nelze bezpečně sdílet."; }
  }

  const exportImage = async () => {
    if (!shareData || busy || photoLoading || waterLoading) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const blob = await renderShareCard(shareData, displayedPhoto?.blob, displayedPhoto);
      downloadBlob(blob, getCatchShareFileName(shareData));
      setMessage("Obrázková karta se stáhla. Obsahuje pouze údaje povolené ke sdílení.");
    } catch (exportError) {
      setError(exportError?.message || "Kartu úlovku se nepodařilo exportovat.");
    } finally {
      setBusy(false);
    }
  };

  const shareImage = async () => {
    if (!shareData || busy || photoLoading || waterLoading) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const blob = await renderShareCard(shareData, displayedPhoto?.blob, displayedPhoto);
      const file = new File([blob], getCatchShareFileName(shareData), { type: "image/png" });
      const canShareImage = typeof navigator.share === "function"
        && typeof navigator.canShare === "function"
        && navigator.canShare({ files: [file] });
      if (!canShareImage) {
        downloadBlob(blob, getCatchShareFileName(shareData));
        setMessage("Toto zařízení neumí sdílet obrázek přímo. Karta se stáhla a můžeš ji přiložit ručně.");
        return;
      }
      await navigator.share({ files: [file], title: `Úlovek: ${shareData.species}`, text: formatCatchShareText(shareData) });
      try {
        const reward = await progressionLedger.awardPublicShare(record.id, scope);
        window.dispatchEvent(new Event("chytnu:progression-changed"));
        setMessage(!reward.eligible
          ? "Obrázková karta byla sdílena. Neověřený úlovek XP neuděluje."
          : reward.isNew
            ? "Obrázková karta byla předána systémovému sdílení. Získáno +10 XP."
            : "Obrázková karta byla sdílena. Bonus za tento úlovek už byl připsán.");
      } catch {
        setMessage("Obrázková karta byla sdílena, ale bonus XP se nepodařilo uložit.");
      }
    } catch (shareError) {
      if (shareError?.name !== "AbortError") setError(shareError?.message || "Obrázkovou kartu se nepodařilo sdílet.");
    } finally {
      setBusy(false);
    }
  };

  if (state.loading) return <main className="catch-share-page"><p className="loading-state" role="status">Načítám úlovek…</p></main>;
  if (state.error) return <main className="catch-share-page"><section className="catch-share-error" role="alert"><h1>Úlovek se nepodařilo načíst</h1><p>{state.error}</p><button type="button" onClick={refresh}>Zkusit znovu</button></section></main>;
  if (shareDataError) return <main className="catch-share-page"><section className="catch-share-error" role="alert"><p>{shareDataError}</p><Link to={`/catch/${id}`}>Zpět na úlovek</Link></section></main>;
  if (!record) return <main className="catch-share-page"><section className="catch-share-error"><h1>Úlovek nenalezen</h1><Link to="/journal">Zpět do deníku</Link></section></main>;

  const length = formatMetric(shareData.lengthCm, 1);
  const weight = formatMetric(shareData.weightKg, 2);
  const date = formatDate(shareData.caughtAt);
  return <main className="catch-share-page">
    <header className="catch-share-header">
      <Link className="progression-back" to={`/catch/${record.id}`}>← Detail úlovku</Link>
      <h1>Sdílet úlovek</h1>
      <p>Karta s tvým úlovkem</p>
    </header>
    <section className="catch-share-preview" aria-label="Náhled sdílené karty">
      <div className="catch-share-card-heading">
        <span className="catch-share-card-brand">CHYTNUCZ <i aria-hidden="true">/</i> RYBÁŘSKÝ DENÍK</span>
        <span className={`catch-share-rarity catch-share-rarity--${rarity.key}`}>{rarity.label}</span>
      </div>
      <h2 className="catch-share-species">{shareData.species}</h2>
      <div className="catch-share-measurements" aria-label="Rozměry úlovku">
        {length !== null && <div className="catch-share-length"><span>DÉLKA</span><strong>{length}<small> cm</small></strong></div>}
        {weight !== null && <div className={`catch-share-weight${length === null ? " catch-share-weight--solo" : ""}`}><span>VÁHA</span><strong>{weight}<small> kg</small></strong></div>}
        {length === null && weight === null && <span className="catch-share-no-measurements">Zaznamenaný úlovek</span>}
      </div>
      <div className="catch-share-meta">
        {shareData.waterName && <span className="catch-share-water">{shareData.waterName}</span>}
        {date && <span>{date}</span>}
      </div>
      {displayedPhoto
        ? <div className="catch-share-photo-frame"><img src={displayedPhoto.url} style={getSharePreviewFrameStyle(displayedPhoto)} alt="Fotografie úlovku" /></div>
        : <div className="catch-share-photo-placeholder"><CatchFishIcon /><span>CHYTNUCZ</span></div>}
      <span className="catch-share-brand">ZAPSÁNO V CHYTNUCZ</span>
    </section>
    {photoBroken && <p className="catch-share-photo-note" role="status">Fotografii se nepodařilo načíst. Karta bude mít tmavé značkové pozadí.</p>}
    {photoLoading && <p className="catch-share-photo-note" role="status">Načítám fotografii úlovku…</p>}
    {waterLoading && <p className="catch-share-photo-note" role="status">Ověřuji revír uložený v aktivním profilu…</p>}
    {waterUnavailable && <p className="catch-share-photo-note" role="status">Revír se nepodařilo ověřit, proto ho karta vynechá.</p>}
    <section className="catch-share-options" aria-label="Export úlovku">
      <button type="button" disabled={busy || photoLoading || waterLoading} onClick={exportImage}>
        <strong>{busy ? "Připravuji obrázek…" : "Uložit obrázek"}</strong>
        <span>Stáhne celou kartu jako PNG</span>
      </button>
      <button type="button" disabled aria-disabled="true" title="Export PDF zatím není dostupný bez ověření Supporter oprávnění.">
        <strong>Export deníku do PDF</strong>
        <span>{getEntitlementState(null, "supporter") === "active" ? "Supporter" : "Supporter · nákup zatím nedostupný"}</span>
      </button>
    </section>
    {message && <p className="catch-share-message" role="status">{message}</p>}
    {error && <p className="catch-share-error-text" role="alert">{error}</p>}
    <div className="catch-share-actions">
      <button type="button" disabled={busy || photoLoading || waterLoading} onClick={shareImage}>{busy ? "Připravuji…" : "Sdílet jako příběh · +10 XP"}</button>
    </div>
  </main>;
}
