import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { DEFAULT_METHODS } from "../shared/constants/constants";
import { createTripRecord } from "../features/trips/data/tripModel";
import { useTrips } from "../features/trips/context/useTrips";
import "./TripFormPage.css";

function TripCreatePage() {
  const navigate = useNavigate();
  const { state, startTrip, refresh } = useTrips();
  const [values, setValues] = useState({ title: "", locationName: "", methodKey: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const update = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const handleStart = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const trip = await startTrip(createTripRecord(values));
      navigate(`/trips/${trip.id}`, { replace: true });
    } catch (startError) {
      setError(startError.message || "Vycházku se nepodařilo zahájit.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return <Layout><div className="trip-form-page">
    <Link to="/trips" className="trip-back-link">← Vycházky</Link>
    <header><h1>Nová vycházka</h1><p>Začátek se uloží do tohoto zařízení.</p></header>
    {state.error && <p className="trip-form-error" role="alert">{state.error} <button type="button" onClick={refresh}>Zkusit znovu</button></p>}
    {state.trips.some((trip) => !trip.endedAt) && <p className="trip-form-notice">Nejprve ukonči aktivní vycházku, potom můžeš zahájit další.</p>}
    <form onSubmit={handleStart}>
      <label>Název (volitelný)<input value={values.title} maxLength={80} onChange={(event) => update("title", event.target.value)} placeholder={`Vycházka · ${new Date().toLocaleDateString("cs-CZ")}`} /></label>
      <label>Lokalita (volitelná)<input value={values.locationName} maxLength={120} onChange={(event) => update("locationName", event.target.value)} placeholder="Název místa nebo revíru" /></label>
      <label>Metoda (volitelná)<select value={values.methodKey} onChange={(event) => update("methodKey", event.target.value)}><option value="">Neuvedena</option>{DEFAULT_METHODS.map((method) => <option key={method.key} value={method.key}>{method.label}</option>)}</select></label>
      {error && <p role="alert" className="trip-form-error">{error}</p>}
      <button type="submit" className="save-catch-button" disabled={saving || state.loading || Boolean(state.error) || state.trips.some((trip) => !trip.endedAt)}>{saving ? "Zahajuji…" : "Zahájit vycházku"}</button>
    </form>
  </div></Layout>;
}

export default TripCreatePage;
