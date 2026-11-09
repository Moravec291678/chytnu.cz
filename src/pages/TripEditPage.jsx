import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { tripToForm } from "../features/trips/data/tripModel";
import { useTrips } from "../features/trips/context/useTrips";
import "./TripFormPage.css";
import TripDefaultsFields from "../features/trips/components/TripDefaultsFields.jsx";
import { applyWaterToFishingForm } from "../features/waters/data/waterSelection.js";

function TripEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state, updateTrip, refresh } = useTrips();
  const trip = state.trips.find((item) => item.id === id);
  if (state.loading) return <Layout><div className="trip-form-page"><p className="loading-state" role="status">Načítám vycházku…</p></div></Layout>;
  if (state.error) return <Layout><div className="trip-form-page"><p className="trip-form-error" role="alert">{state.error}</p><button type="button" onClick={refresh}>Zkusit znovu</button></div></Layout>;
  if (!trip) return <Layout><div className="trip-form-page"><h1>Vycházka nenalezena</h1><Link to="/trips">Zpět na vycházky</Link></div></Layout>;
  return <TripEditForm key={trip.id} trip={trip} updateTrip={updateTrip} navigate={navigate} />;
}

function TripEditForm({ trip, updateTrip, navigate }) {
  const baseTrip = useRef(trip);
  const [values, setValues] = useState(() => tripToForm(trip));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const update = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await updateTrip(baseTrip.current, values);
      navigate(`/trips/${trip.id}`, { replace: true });
    } catch (saveError) {
      setError(saveError?.message || "Vycházku se nepodařilo upravit.");
    } finally { savingRef.current = false; setSaving(false); }
  };
  return <Layout><div className="trip-form-page">
    <Link to={`/trips/${trip.id}`} className="trip-back-link">← Detail vycházky</Link>
    <header><h1>Upravit vycházku</h1><p>Nové výchozí údaje se použijí u dalších rychlých úlovků. Dřívější záznamy se nemění.</p></header>
    <form onSubmit={submit}>
      <label>Název<input value={values.title} maxLength={80} required onChange={(event) => update("title", event.target.value)} /></label>
      <label>Lokalita (volitelná)<input value={values.locationName} maxLength={120} onChange={(event) => update("locationName", event.target.value)} /></label>
      <TripDefaultsFields values={values} onChange={update} onWaterSelect={(water,previous)=>setValues(current=>applyWaterToFishingForm(current,water,previous))} />
      <label>Začátek<input type="datetime-local" step="1" value={values.startedAt} onChange={(event) => update("startedAt", event.target.value)} required /></label>
      {trip.endedAt && <label>Konec<input type="datetime-local" step="1" value={values.endedAt} onChange={(event) => update("endedAt", event.target.value)} required /></label>}
      {error && <div className="trip-form-error" role="alert"><p>{error}</p><button type="button" onClick={() => window.location.reload()}>Načíst aktuální údaje</button></div>}
      <button className="save-catch-button" type="submit" disabled={saving}>{saving ? "Ukládám…" : "Uložit změny"}</button>
    </form>
  </div></Layout>;
}

export default TripEditPage;
