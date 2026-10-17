import Layout from "../shared/layout/Layout";
import TripCard from "../features/trips/components/TripCard";
import ActiveTripCard from "../features/trips/components/ActiveTripCard";
import { Link } from "react-router-dom";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import { getActiveTrip, getTripDurationMs } from "../features/trips/data/tripModel";
import "./TripsPage.css";

function pluralize(count) {
  const remainder = count % 100;
  if (remainder >= 11 && remainder <= 14) return "výprav";
  const digit = count % 10;
  if (digit === 1) return "výprava";
  if (digit >= 2 && digit <= 4) return "výpravy";
  return "výprav";
}

function TripsPage() {
  const { state: tripState, refresh } = useTrips();
  const { state: catchState } = useCatches();
  const activeTrip = getActiveTrip(tripState.trips);
  const completedTrips = tripState.trips.filter((trip) => trip.endedAt).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const totalHours = Math.floor(tripState.trips.reduce((sum, trip) => sum + (getTripDurationMs(trip) ?? 0), 0) / 3600000);
  return (
    <Layout>
      <div className="trips-page">
        <header className="trips-header">
          <div className="trips-header-top">
            <div className="trips-header-top-wrapper">
              <h1>Výpravy</h1>

              <p className="trips-subtitle">
                {tripState.trips.length} {pluralize(tripState.trips.length)} · {totalHours} h
              </p>
            </div>
            {!activeTrip && <Link aria-label="Zahájit výpravu" className="trips-add-btn header-btn" to="/trips/new">＋</Link>}
          </div>
          <div className="trips-header-bottom">{/* filters*/}</div>
        </header>

        {tripState.error && <div className="empty-search" role="alert"><p>{tripState.error}</p><button type="button" onClick={refresh}>Zkusit znovu</button></div>}
        {tripState.loading ? <div className="empty-search"><p>Načítám výpravy…</p></div> : null}
        {activeTrip && <ActiveTripCard activeTrip={activeTrip} catches={catchState.catches} />}
        {!tripState.loading && !tripState.error && !activeTrip && <div className="empty-search"><p>Není aktivní žádná výprava. Novou zahájíš tlačítkem + nahoře.</p></div>}

        <section className="trips-section">
          <h3 className="section-title">Dokončené výpravy</h3>

          {completedTrips.length === 0 && <p className="trips-empty-history">Dokončené výpravy se zde zobrazí po jejich ukončení.</p>}
          {completedTrips.map((trip) => (
            <TripCard key={trip.id} trip={trip} catches={catchState.catches} />
          ))}
        </section>
      </div>
    </Layout>
  );
}

export default TripsPage;
