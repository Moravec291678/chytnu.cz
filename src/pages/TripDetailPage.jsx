import { useCallback, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import CatchCard from "../features/catches/components/CatchCard";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import { formatTripDuration, getTripDurationMs } from "../features/trips/data/tripModel";
import { DEFAULT_METHODS } from "../shared/constants/constants";
import ConfirmDialog from "../shared/components/ConfirmDialog";
import "./TripFormPage.css";

function TripDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state: tripState, endTrip, deleteTrip, refresh: refreshTrips } = useTrips();
  const { state: catchState, refresh: refreshCatches } = useCatches();
  const [error, setError] = useState("");
  const [ending, setEnding] = useState(false);
  const endingRef = useRef(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const trip = tripState.trips.find((item) => item.id === id);
  const closeDeleteDialog = useCallback(() => setConfirmingDelete(false), []);
  if (tripState.loading) return <Layout><div className="trip-form-page"><p className="loading-state" role="status">Načítám výpravu…</p></div></Layout>;
  if (tripState.error) return <Layout><div className="trip-form-page"><p className="trip-form-error" role="alert">{tripState.error}</p><button type="button" onClick={refreshTrips}>Zkusit znovu</button></div></Layout>;
  if (!trip) return <Layout><div className="trip-form-page"><h1>Výprava nenalezena</h1><p>Místní záznam se nenašel nebo úložiště není dostupné.</p><Link to="/trips">Zpět na výpravy</Link></div></Layout>;
  const tripCatches = catchState.catches.filter((item) => item.tripId === trip.id).sort((a, b) => Date.parse(b.caughtAt) - Date.parse(a.caughtAt));
  const method = DEFAULT_METHODS.find((item) => item.key === trip.methodKey)?.label;
  const handleEnd = async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setEnding(true);
    setError("");
    try { await endTrip(trip); navigate("/trips", { replace: true }); }
    catch (endError) { setError(endError.message || "Výpravu se nepodařilo ukončit."); endingRef.current = false; setEnding(false); }
  };
  const handleDelete = async () => {
    if (deletingRef.current || catchState.loading || catchState.error || tripCatches.length > 0) return;
    deletingRef.current = true;
    setDeleting(true);
    setError("");
    try { await deleteTrip(trip.id); navigate("/trips", { replace: true }); }
    catch (deleteError) { setError(deleteError.message || "Výpravu se nepodařilo smazat."); deletingRef.current = false; setDeleting(false); }
  };
  return <Layout><div className="trip-form-page">
    <Link to="/trips" className="trip-back-link">← Výpravy</Link>
    <header><p className={trip.endedAt ? "trip-status-complete" : "trip-status-active"}>{trip.endedAt ? "Dokončená výprava" : "Aktivní výprava"}</p><h1>{trip.title}</h1><p>{trip.locationName || "Lokalita neuvedena"}{method ? ` · ${method}` : ""}</p></header>
    <section className="trip-detail-summary"><div><span>Začátek</span><strong>{new Date(trip.startedAt).toLocaleString("cs-CZ")}</strong></div><div><span>Konec</span><strong>{trip.endedAt ? new Date(trip.endedAt).toLocaleString("cs-CZ") : "Výprava probíhá"}</strong></div><div><span>Trvání</span><strong>{formatTripDuration(getTripDurationMs(trip))}</strong></div><div><span>Úlovky</span><strong>{catchState.loading || catchState.error ? "—" : tripCatches.length}</strong></div></section>
    {error && <p role="alert" className="trip-form-error">{error}</p>}
    {!trip.endedAt && <button className="trip-end-button" type="button" onClick={handleEnd} disabled={ending}>{ending ? "Ukončuji…" : "Ukončit výpravu"}</button>}
    <Link className="trip-edit-link" to={`/trips/${trip.id}/edit`}>Upravit výpravu</Link>
    <section className="trip-delete-section">
      {catchState.loading ? <p role="status">Načítám úlovky pro ověření vazeb…</p>
        : catchState.error ? <p>Výpravu nelze bezpečně smazat, dokud se nepodaří načíst její úlovky.</p>
          : tripCatches.length ? <p>Výpravu nelze smazat, dokud k ní patří úlovky. Otevři úlovek a v úpravách ho odpoj nebo přiřaď jinam.</p>
            : <button type="button" className="trip-delete-button" onClick={() => setConfirmingDelete(true)}>Smazat prázdnou výpravu</button>}
    </section>
    {catchState.error && <p className="trip-form-error" role="alert">{catchState.error} <button type="button" onClick={refreshCatches}>Načíst úlovky znovu</button></p>}
    {confirmingDelete && <ConfirmDialog titleId="delete-trip-title" descriptionId="delete-trip-description" title="Smazat výpravu?" description="Tato prázdná výprava včetně její historie bude trvale odstraněna z tohoto zařízení." busy={deleting} confirmLabel="Smazat výpravu" busyLabel="Mažu…" confirmClassName="trip-delete-button" onCancel={closeDeleteDialog} onConfirm={handleDelete} />}
    <h2 className="section-title">Úlovky z výpravy</h2>
    {catchState.loading ? <p className="loading-state" role="status">Načítám úlovky výpravy…</p> : catchState.error ? null : tripCatches.length ? tripCatches.map((item) => <CatchCard key={item.id} catchedFish={item} />) : <div className="empty-search"><p>Úlovky přiřazené k této výpravě se zobrazí zde.</p><Link to="/add" state={{ tripId: trip.id }}>Přidat úlovek</Link></div>}
  </div></Layout>;
}

export default TripDetailPage;
