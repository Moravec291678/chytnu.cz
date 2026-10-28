import Layout from "../shared/layout/Layout";
import TripCard from "../features/trips/components/TripCard";
import ActiveTripCard from "../features/trips/components/ActiveTripCard";
import { Link } from "react-router-dom";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import { formatTripCatchCount, getActiveTrip } from "../features/trips/data/tripModel";
import { getTotalTripsHours, getTripCatchCount } from "../features/trips/utils/tripStats.js";
import "./TripsPage.css";

function pluralize(count) {
  const remainder = count % 100;
  if (remainder >= 11 && remainder <= 14) return "vycházek";
  const digit = count % 10;
  if (digit === 1) return "vycházka";
  if (digit >= 2 && digit <= 4) return "vycházky";
  return "vycházek";
}

function TripsPage() {
  const { state: tripState, refresh: refreshTrips } = useTrips();
  const { state: catchState, refresh: refreshCatches } = useCatches();
  const activeTrip = getActiveTrip(tripState.trips);
  const completedTrips = tripState.trips.filter((trip) => trip.endedAt).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const totalHours = getTotalTripsHours(tripState.trips);
  const tripCatchCount = getTripCatchCount(catchState.catches, tripState.trips);
  const tripCatches = catchState.loading || catchState.error ? null : catchState.catches;
  return (
    <Layout>
      <div className="trips-page">
        <header className="trips-header">
          <div className="trips-header-top">
            <div className="trips-header-top-wrapper">
              <h1>Vycházky</h1>

              <p className="trips-subtitle">
                {tripState.loading || catchState.loading ? "Načítám přehled…" : `${tripState.trips.length} ${pluralize(tripState.trips.length)} · ${totalHours} hodin · ${formatTripCatchCount(tripCatchCount)}`}
              </p>
            </div>
            {!activeTrip && !tripState.loading && !tripState.error && <Link aria-label="Zahájit vycházku" className="trips-add-btn header-btn" to="/trips/new">＋</Link>}
          </div>
        </header>

        {tripState.error && <div className="trips-empty" role="alert"><p>{tripState.error}</p><button type="button" onClick={refreshTrips}>Zkusit znovu</button></div>}
        {catchState.error && <div className="trips-empty" role="alert"><p>{catchState.error}</p><button type="button" onClick={refreshCatches}>Načíst úlovky znovu</button></div>}
        {tripState.loading ? <div className="trips-loading" role="status" aria-label="Načítám vycházky"><span /><span /></div> : null}
        {activeTrip && !tripState.error && <ActiveTripCard activeTrip={activeTrip} catches={tripCatches} />}
        {!tripState.loading && !tripState.error && !activeTrip && <div className="trips-empty"><strong>Žádná aktivní vycházka</strong><p>Spusť novou vycházku a přiřazuj k ní své úlovky.</p><Link to="/trips/new">Zahájit vycházku</Link></div>}

        <section className="trips-section">
          <h3 className="section-title">Minulé vycházky</h3>

          {!tripState.loading && !tripState.error && completedTrips.length === 0 && <p className="trips-empty-history">Dokončené vycházky se zde zobrazí po jejich ukončení.</p>}
          {completedTrips.map((trip) => (
            <TripCard key={trip.id} trip={trip} catches={tripCatches} />
          ))}
        </section>
      </div>
    </Layout>
  );
}

export default TripsPage;
