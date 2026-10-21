import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCatches } from "../features/catches/context/useCatches";
import { createCatchShareData, formatCatchShareText, getCatchShareFileName, shouldIncludeCatchWater } from "../features/catches/data/catchShare.js";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { getCatchRarity } from "../features/catches/utils/rarity.js";
import { DEFAULT_SPECIES } from "../shared/constants/speciesCatalog.js";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import { progressionLedger } from "../features/progression/data/progressionLedger.js";
import { getEntitlementState } from "../features/entitlements/data/entitlementAccess.js";
import { normalizePhotoFrame, photoFrameStyle } from "../features/catches/data/photoFraming.js";
import { getPrimaryAvailablePhoto } from "../features/catches/data/catchPhotos.js";
import { getPhotoBlobForDisplay } from "../features/catches/data/photoCloudService.js";
import "./ProgressionPages.css";

function imageDimensions(image) {
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

async function decodePhoto(blob) {
  if (!(blob instanceof Blob)) throw new TypeError("Fotografie úlovku není dostupná.");
  if (globalThis.createImageBitmap) return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Fotografii úlovku se nepodařilo načíst."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawCover(context, image, x, y, width, height, positionX = 0.5, positionY = 0.44, zoom = 1) {
  const { width: imageWidth, height: imageHeight } = imageDimensions(image);
  if (!imageWidth || !imageHeight) throw new Error("Fotografie nemá platné rozměry.");
  const scale = Math.max(width / imageWidth, height / imageHeight) * zoom;
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (imageWidth - sourceWidth) * positionX;
  const sourceY = (imageHeight - sourceHeight) * positionY;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function roundedRectPath(context, x, y, width, height, radius) {
  context.beginPath();
  if (typeof context.roundRect === "function") context.roundRect(x, y, width, height, radius);
  else {
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }
}

function drawFishMark(context, color) {
  context.save();
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(392, 535);
  context.bezierCurveTo(452, 448, 602, 442, 692, 521);
  context.lineTo(770, 464);
  context.lineTo(770, 608);
  context.lineTo(692, 551);
  context.bezierCurveTo(602, 630, 452, 620, 392, 535);
  context.fill();
  context.beginPath();
  context.arc(620, 515, 8, 0, Math.PI * 2);
  context.fillStyle = "#111820";
  context.fill();
  context.restore();
}

function fitText(context, text, maxWidth) {
  let result = String(text ?? "");
  if (context.measureText(result).width <= maxWidth) return result;
  while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
  return `${result}…`;
}

function weightLabel(data) {
  if (data.weightKg === null) return null;
  const weight = `${data.weightKg.toLocaleString("cs-CZ")} kg`;
  return data.weightSource === "estimated" ? `≈ ${weight} · ODHAD` : weight;
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long" }).format(new Date(value)) : "";
}

async function renderShareCard(data, photoBlob = null, photoFrame = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1800;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Grafickou kartu se nepodařilo vytvořit v tomto prohlížeči.");

  const styles = getComputedStyle(document.documentElement);
  const readColor = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  const appBackground = readColor("--app-bg", "#111820");
  const surface = readColor("--surface-2", "#202e40");
  const green = readColor("--accent-green", "#2ecc71");
  const orange = readColor("--accent-orange", "#ffab1f");
  const primaryText = readColor("--text-primary", "#eff5ff");
  const secondaryText = readColor("--text-secondary", "#829db8");

  let photo = null;
  if (photoBlob) {
    try { photo = await decodePhoto(photoBlob); } catch { photo = null; }
  }
  try {
    if (photo) {
      try { drawCover(context, photo, 0, 0, canvas.width, canvas.height); }
      catch {
        photo.close?.();
        photo = null;
      }
    }
    if (!photo) {
      const background = context.createLinearGradient(0, 0, 1080, 1800);
      background.addColorStop(0, appBackground);
      background.addColorStop(1, surface);
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (photo) {
      const overlay = context.createLinearGradient(0, 0, 0, canvas.height);
      overlay.addColorStop(0, "rgba(8, 14, 19, .48)");
      overlay.addColorStop(.38, "rgba(8, 14, 19, .58)");
      overlay.addColorStop(1, "rgba(8, 14, 19, .95)");
      context.fillStyle = overlay;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.strokeStyle = orange;
    context.lineWidth = 4;
    context.strokeRect(48, 48, 984, 1704);
    context.textAlign = "center";
    context.fillStyle = secondaryText;
    context.font = "800 30px Arial";
    context.fillText("CHYTNUCZ · RYBÁŘSKÝ DENÍK", 540, 150);

    context.font = "900 26px Arial";
    const badgeText = data.rarity.toLocaleUpperCase("cs-CZ");
    const badgeWidth = Math.max(230, context.measureText(badgeText).width + 64);
    roundedRectPath(context, (1080 - badgeWidth) / 2, 215, badgeWidth, 66, 22);
    context.fillStyle = data.rarityKey === "legendary" || data.rarityKey === "epic" ? orange : "rgba(18, 27, 36, .88)";
    context.fill();
    context.fillStyle = data.rarityKey === "legendary" || data.rarityKey === "epic" ? "#111820" : primaryText;
    context.fillText(badgeText, 540, 258);

    if (!photo) drawFishMark(context, orange);

    const weight = weightLabel(data);
    context.fillStyle = orange;
    context.font = weight?.includes("ODHAD") ? "900 74px Arial" : "900 100px Arial";
    context.fillText(fitText(context, weight || "Zaznamenaný úlovek", 930), 540, 800);

    context.fillStyle = primaryText;
    context.font = "800 56px Arial";
    context.fillText(fitText(context, data.species, 940), 540, 920);

    if (data.lengthCm !== null) {
      context.fillStyle = primaryText;
      context.font = "700 42px Arial";
      context.fillText(`${data.lengthCm.toLocaleString("cs-CZ")} cm`, 540, 992);
    }

    const date = formatDate(data.caughtAt);
    const details = [data.waterName, date].filter(Boolean);
    context.fillStyle = secondaryText;
    context.font = "600 38px Arial";
    details.forEach((line, index) => context.fillText(fitText(context, line, 920), 540, 1090 + index * 58));

    if (photo) {
      const thumbX = 150;
      const thumbY = 1240;
      const thumbW = 780;
      const thumbH = 440;
      context.save();
      roundedRectPath(context, thumbX, thumbY, thumbW, thumbH, 26);
      context.clip();
      const frame = normalizePhotoFrame(photoFrame);
      drawCover(context, photo, thumbX, thumbY, thumbW, thumbH, frame.focalX, frame.focalY, frame.zoom);
      context.restore();
      context.strokeStyle = "rgba(255,255,255,.82)";
      context.lineWidth = 5;
      roundedRectPath(context, thumbX, thumbY, thumbW, thumbH, 26);
      context.stroke();
    }

    context.fillStyle = green;
    context.font = "900 42px Arial";
    context.fillText("CHYTNUCZ", 540, 1660);
    context.fillStyle = secondaryText;
    context.font = "600 24px Arial";
    context.fillText("Tvůj rybářský deník", 540, 1700);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Obrázek úlovku se nepodařilo exportovat.")), "image/png");
    });
  } finally {
    photo?.close?.();
  }
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
        const decoded = await decodePhoto(blob);
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
        setMessage(reward.isNew
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

  const weight = weightLabel(shareData);
  return <main className="catch-share-page">
    <header className="catch-share-header">
      <Link className="progression-back" to={`/catch/${record.id}`}>← Detail úlovku</Link>
      <h1>Sdílet úlovek</h1>
      <p>Karta s tvým úlovkem</p>
    </header>
    <section className={`catch-share-preview${displayedPhoto ? " has-photo" : ""}`} style={displayedPhoto ? { backgroundImage: `url("${displayedPhoto.url}")`, backgroundPosition: "center 42%" } : undefined} aria-label="Náhled sdílené karty">
      <span className="catch-share-card-brand">CHYTNUCZ · RYBÁŘSKÝ DENÍK</span>
      <span className={`catch-share-rarity catch-share-rarity--${rarity.key}`}>{rarity.label}</span>
      {!displayedPhoto && <CatchFishIcon />}
      <strong>{weight || "Zaznamenaný úlovek"}</strong>
      <h2>{shareData.species}{shareData.lengthCm !== null ? ` · ${shareData.lengthCm.toLocaleString("cs-CZ")} cm` : ""}</h2>
      {shareData.waterName && <p className="catch-share-water">{shareData.waterName}</p>}
      {shareData.caughtAt && <p>{formatDate(shareData.caughtAt)}</p>}
      {displayedPhoto && <span className="catch-share-thumbnail"><img src={displayedPhoto.url} style={photoFrameStyle(displayedPhoto)} alt="Náhled stejné fotografie úlovku" /></span>}
      <span className="catch-share-brand">CHYTNUCZ</span>
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
