import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { DEFAULT_METHODS } from "../shared/constants/constants";
import { tripToForm } from "../features/trips/data/tripModel";
import { useTrips } from "../features/trips/context/useTrips";
import "./TripFormPage.css";

function TripEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state, updateTrip } = useTrips();
  const trip = state.trips.find((item) => item.id === id);
  if (state.loading) return <Layout><div className="trip-form-page"><p>Načítám výpravu…</p></div></Layout>;
  if (!trip) return <Layout><div className="trip-form-page"><h1>Výprava nenalezena</h1><Link to="/trips">Zpět na výpravy</Link></div></Layout>;
  return <TripEditForm key={trip.id} trip={trip} updateTrip={updateTrip} navigate={navigate} />;
}

function TripEditForm({ trip, updateTrip, navigate }) {
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
      await updateTrip(trip, values);
      navigate(`/trips/${trip.id}`, { replace: true });
    } catch (saveError) {
      setError(saveError?.message || "Výpravu se nepodařilo upravit.");
    } finally { savingRef.current = false; setSaving(false); }
  };
  return <Layout><div className="trip-form-page">
    <Link to={`/trips/${trip.id}`} className="trip-back-link">← Detail výpravy</Link>
    <header><h1>Upravit výpravu</h1><p>Úlovky a jejich vazby zůstanou zachované.</p></header>
    <form onSubmit={submit}>
      <label>Název<input value={values.title} maxLength={80} required onChange={(event) => update("title", event.target.value)} /></label>
      <label>Lokalita (volitelná)<input value={values.locationName} maxLength={120} onChange={(event) => update("locationName", event.target.value)} /></label>
      <label>Metoda (volitelná)<select value={values.methodKey} onChange={(event) => update("methodKey", event.target.value)}><option value="">Neuvedena</option>{DEFAULT_METHODS.map((method) => <option key={method.key} value={method.key}>{method.label}</option>)}</select></label>
      <label>Začátek<input type="datetime-local" step="1" value={values.startedAt} onChange={(event) => update("startedAt", event.target.value)} required /></label>
      {trip.endedAt && <label>Konec<input type="datetime-local" step="1" value={values.endedAt} onChange={(event) => update("endedAt", event.target.value)} required /></label>}
      {error && <p className="trip-form-error" role="alert">{error}</p>}
      <button className="save-catch-button" type="submit" disabled={saving}>{saving ? "Ukládám…" : "Uložit změny"}</button>
    </form>
  </div></Layout>;
}

export default TripEditPage;
