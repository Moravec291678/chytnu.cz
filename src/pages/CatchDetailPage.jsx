import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import "./AddCatchPage.css";

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

function valueLabel(value, unit) {
  return value === null || value === undefined || value === "" ? null : `${value} ${unit}`;
}

function CatchDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { state, deleteCatch } = useCatches();
  const { state: tripState } = useTrips();
  const item = state.catches.find((record) => record.id === id);
  const trip = tripState.trips.find((record) => record.id === item?.tripId);
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!item) return undefined;
    const entries = (item.photos ?? []).filter((photo) => photo.blob).map((photo) => ({ ...photo, url: URL.createObjectURL(photo.blob) }));
    let active = true;
    Promise.resolve().then(() => { if (active) setPhotos(entries); });
    return () => {
      active = false;
      entries.forEach((photo) => URL.revokeObjectURL(photo.url));
    };
  }, [item]);

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setError("");
    try {
      await deleteCatch(id);
      navigate("/", { replace: true });
    } catch (deleteError) {
      setError(deleteError.message || "Úlovek se nepodařilo smazat.");
      setDeleting(false);
    }
  };

  if (state.loading) return <Layout><p>Načítám úlovek…</p></Layout>;
  if (!item) return <Layout><section className="add-catch-section"><h1>Úlovek nenalezen</h1><p>Mohl být smazán nebo uložené místní úložiště není dostupné.</p><Link to="/">Zpět do deníku</Link></section></Layout>;

  const facts = [
    ["Váha", valueLabel(item.weightKg, "kg")], ["Délka", valueLabel(item.lengthCm, "cm")],
    ["Obvod", valueLabel(item.girthCm, "cm")], ["Délka boje", valueLabel(item.fightMinutes, "min")],
    ["Lokalita", item.locationName], ["Číslo revíru", item.waterNumber],
    ["GPS poloha", item.gpsLocation], ["Hloubka", valueLabel(item.waterDepthM, "m")],
    ["Typ dna", item.bottomType], ["Metoda", item.method?.label],
    ["Výsledek", item.result === "released" ? "Puštěno zpět" : item.result === "kept" ? "Ponecháno" : null],
    ["Nástrahy", item.baits?.map((bait) => bait.label).join(", ")],
    ["Výprava", trip?.title],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");

  return <Layout>
    <main className="add-catch-page">
      <header className="add-catch-header">
        <Link to="/">← Deník</Link>
        <h1>{item.species}</h1>
        {item.speciesLatin && <p>{item.speciesLatin}</p>}
        <p>{formatDate(item.caughtAt)}</p>
      </header>
      {location.state?.saved && <p role="status">Úlovek byl uložen do tohoto zařízení.</p>}
      {error && <p role="alert" className="catch-form-error">{error}</p>}
      {photos.map((photo) => <figure className="photo-preview-item" key={photo.id}><img src={photo.url} alt={`Fotografie úlovku – ${item.species}`} /></figure>)}
      <section className="add-catch-section"><h2>Podrobnosti</h2><dl className="catch-detail-list">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
      {item.notes && <section className="add-catch-section"><h2>Poznámky</h2><p>{item.notes}</p></section>}
      {item.isFavorite && <p>⭐ Oblíbený úlovek</p>}
      {trip && <p><Link to={`/trips/${trip.id}`}>Otevřít výpravu: {trip.title}</Link></p>}
      <div className="catch-detail-actions"><Link className="save-catch-button" to={`/catch/${item.id}/edit`}>Upravit úlovek</Link><button className="photo-action-button" type="button" onClick={() => setConfirmingDelete(true)} disabled={deleting}>{deleting ? "Mažu…" : "Smazat úlovek"}</button></div>
      {confirmingDelete && <div className="catch-confirm-backdrop"><section className="catch-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-catch-title" aria-describedby="delete-catch-description"><h2 id="delete-catch-title">Smazat úlovek?</h2><p id="delete-catch-description">Tato akce smaže úlovek i jeho lokálně uloženou fotografii. Nelze ji vrátit.</p><div className="catch-detail-actions"><button className="photo-action-button" type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Zrušit</button><button className="catch-delete-confirm" type="button" onClick={handleDelete} disabled={deleting}>{deleting ? "Mažu…" : "Smazat úlovek"}</button></div></section></div>}
    </main>
  </Layout>;
}

export default CatchDetailPage;
