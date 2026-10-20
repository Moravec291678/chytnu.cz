import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCatches } from "../features/catches/context/useCatches";
import { createCatchShareData, formatCatchShareText, getCatchShareFileName } from "../features/catches/data/catchShare";
import "./ProgressionPages.css";

async function loadPhoto(blob) {
  if (!(blob instanceof Blob)) return null;
  if (globalThis.createImageBitmap) return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Fotografii úlovku se nepodařilo načíst."));
      image.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

function drawCover(context, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  context.drawImage(image, (image.width - sourceWidth) / 2, (image.height - sourceHeight) / 2, sourceWidth, sourceHeight, x, y, width, height);
}

async function renderShareCard(data, photoBlob = null) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1800;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Grafickou kartu se nepodařilo vytvořit v tomto prohlížeči.");
  const styles = getComputedStyle(document.documentElement);
  const color = (name) => styles.getPropertyValue(name).trim();
  const appBackground = color("--app-bg");
  const surface = color("--surface-2");
  const green = color("--accent-green");
  const orange = color("--accent-orange");
  const primaryText = color("--text-primary");
  const secondaryText = color("--text-secondary");
  if (![appBackground, surface, green, orange, primaryText, secondaryText].every(Boolean)) {
    throw new Error("Barvy design systému nejsou dostupné pro export karty.");
  }
  const photo = await loadPhoto(photoBlob);
  if (photo) {
    drawCover(context, photo, 0, 0, canvas.width, canvas.height);
    const overlay = context.createLinearGradient(0, 0, 0, 1800);
    overlay.addColorStop(0, "rgba(8, 14, 19, .35)");
    overlay.addColorStop(.48, "rgba(8, 14, 19, .62)");
    overlay.addColorStop(1, "rgba(8, 14, 19, .94)");
    context.fillStyle = overlay;
    context.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    const gradient = context.createLinearGradient(0, 0, 1080, 1800);
    gradient.addColorStop(0, appBackground);
    gradient.addColorStop(1, surface);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.strokeStyle = orange;
  context.lineWidth = 4;
  context.strokeRect(48, 48, 984, 1704);
  context.fillStyle = secondaryText;
  context.textAlign = "center";
  context.font = "700 30px Arial";
  context.fillText("CHYTNUCZ · RYBÁŘSKÝ DENÍK", 540, 260);

  context.fillStyle = orange;
  context.font = "900 108px Arial";
  const measures = [
    data.weightKg !== null ? `${data.weightKg.toLocaleString("cs-CZ")} kg` : null,
    data.lengthCm !== null ? `${data.lengthCm.toLocaleString("cs-CZ")} cm` : null,
  ].filter(Boolean);
  context.fillText(measures[0] || "Zaznamenaný úlovek", 540, 480);

  if (measures[0] && measures[1]) {
    context.fillStyle = primaryText;
    context.font = "800 48px Arial";
    context.fillText(measures[1], 540, 560);
  }

  context.fillStyle = primaryText;
  context.font = "800 56px Arial";
  context.fillText(data.species.slice(0, 34), 540, 680);

  const date = data.caughtAt
    ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long" }).format(new Date(data.caughtAt))
    : "";
  if (date) {
    context.fillStyle = secondaryText;
    context.font = "600 34px Arial";
    context.fillText(date, 540, 750);
  }

  if (photo) {
    const thumbX = 360;
    const thumbY = 880;
    const thumbW = 360;
    const thumbH = 260;
    const thumbRadius = 24;
    context.save();
    context.beginPath();
    context.roundRect(thumbX, thumbY, thumbW, thumbH, thumbRadius);
    context.clip();
    drawCover(context, photo, thumbX, thumbY, thumbW, thumbH);
    context.restore();
    context.strokeStyle = "rgba(255,255,255,.8)";
    context.lineWidth = 6;
    context.beginPath();
    context.roundRect(thumbX, thumbY, thumbW, thumbH, thumbRadius);
    context.stroke();
  }

  context.fillStyle = green;
  context.font = "800 32px Arial";
  context.fillText("CHYTNUCZ", 540, 1590);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Obrázek úlovku se nepodařilo exportovat.")), "image/png");
  });
}

export default function CatchSharePage() {
  const { id } = useParams();
  const { state, refresh } = useCatches();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const record = state.catches.find((item) => item.id === id);
  const photoBlob = record?.photos?.find((photo) => photo.blob instanceof Blob)?.blob ?? null;
  const [photoUrl, setPhotoUrl] = useState("");
  useEffect(() => {
    let active = true;
    const url = photoBlob ? URL.createObjectURL(photoBlob) : "";
    queueMicrotask(() => { if (active) setPhotoUrl(url); });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photoBlob]);
  let shareData = null;
  let shareDataError = "";
  if (record) {
    try {
      shareData = createCatchShareData(record);
    } catch (shareError) {
      shareDataError = shareError.message || "Údaje úlovku nelze bezpečně sdílet.";
    }
  }

  const download = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const blob = await renderShareCard(shareData, photoBlob);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getCatchShareFileName(shareData);
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Karta úlovku byla připravena ke stažení. Přesná poloha se nesdílí.");
    } catch (shareError) {
      setError(shareError?.message || "Kartu úlovku se nepodařilo exportovat.");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const blob = await renderShareCard(shareData, photoBlob);
      const file = new File([blob], getCatchShareFileName(shareData), { type: "image/png" });
      const text = formatCatchShareText(shareData);
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Úlovek: ${record.species}`, text });
      } else if (navigator.share) {
        await navigator.share({ title: `Úlovek: ${record.species}`, text });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setMessage("Text úlovku byl zkopírován. Obrázkovou kartu můžeš stáhnout zvlášť.");
        return;
      } else {
        await download();
        return;
      }
      setMessage("Úlovek byl předán systémovému sdílení. Přesná poloha se nesdílí.");
    } catch (shareError) {
      if (shareError?.name !== "AbortError") setError(shareError?.message || "Úlovek se nepodařilo sdílet.");
    } finally {
      setBusy(false);
    }
  };

  if (state.loading) return <main className="catch-share-page"><p className="loading-state" role="status">Načítám úlovek…</p></main>;
  if (state.error) return <main className="catch-share-page"><section className="catch-share-error" role="alert"><h1>Úlovek se nepodařilo načíst</h1><p>{state.error}</p><button type="button" onClick={refresh}>Zkusit znovu</button></section></main>;
  if (shareDataError) return <main className="catch-share-page"><section className="catch-share-error" role="alert"><p>{shareDataError}</p><Link to={`/catch/${id}`}>Zpět na úlovek</Link></section></main>;
  if (!record) return <main className="catch-share-page"><section className="catch-share-error"><h1>Úlovek nenalezen</h1><Link to="/journal">Zpět do deníku</Link></section></main>;
  return <main className="catch-share-page">
    <header className="catch-share-header">
      <Link className="progression-back" to={`/catch/${record.id}`}>← Detail úlovku</Link>
      <h1>Sdílet úlovek</h1>
      <p>Karta bez GPS, lokality a soukromých poznámek.</p>
    </header>
    <section className={`catch-share-preview${photoUrl ? " has-photo" : ""}`} style={photoUrl ? { backgroundImage: `linear-gradient(rgba(8,14,19,.35), rgba(8,14,19,.94)), url(${photoUrl})` } : undefined} aria-label="Náhled sdílené karty">
      <span>CHYTNUCZ · RYBÁŘSKÝ DENÍK</span>
      <strong>{shareData.weightKg !== null
        ? `${shareData.weightKg.toLocaleString("cs-CZ")} kg`
        : shareData.lengthCm !== null
          ? `${shareData.lengthCm.toLocaleString("cs-CZ")} cm`
          : "Zaznamenaný úlovek"}</strong>
      {shareData.weightKg !== null && shareData.lengthCm !== null && <span className="catch-share-length">{shareData.lengthCm.toLocaleString("cs-CZ")} cm</span>}
      <h2>{shareData.species}</h2>
      {shareData.caughtAt && <p>{new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long" }).format(new Date(shareData.caughtAt))}</p>}
      {photoUrl && <img className="catch-share-thumbnail" src={photoUrl} alt="Náhled fotografie úlovku" />}
      <span className="catch-share-brand">CHYTNUCZ</span>
    </section>
    <section className="catch-share-options">
      <button type="button" disabled={busy} onClick={download}>
        <strong>{busy ? "Připravuji obrázek…" : "Uložit obrázek"}</strong>
        <span>Stáhne kartu bez soukromých údajů</span>
      </button>
    </section>
    {message && <p className="progression-item" role="status">{message}</p>}
    {error && <p className="progression-item" role="alert">{error}</p>}
    <div className="catch-share-actions">
      <button type="button" disabled={busy} onClick={share}>{busy ? "Připravuji…" : "Sdílet úlovek"}</button>
    </div>
  </main>;
}
