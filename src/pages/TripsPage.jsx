import Layout from "../shared/layout/Layout";
import TripCard from "../features/trips/components/TripCard";
import ActiveTripCard from "../features/trips/components/ActiveTripCard";
import { MOCK_TRIPS } from "../features/trips/data/mockTrips";
import { ACTIVE_TRIP } from "../features/trips/data/activeTrip";
import { getTripsCount } from "../features/trips/utils/tripStats";
import "./TripsPage.css";

function TripsPage() {
  return (
    <Layout>
      <div className="trips-page">
        <header className="trips-header">
          <div className="trips-header-top">
            <div className="trips-header-top-wrapper">
              <h1>Výlety</h1>

              <p className="trips-subtitle">
                {getTripsCount(MOCK_TRIPS)} výletů · 187 hodin · 42 úlovků
              </p>
            </div>
            <button className="trips-add-btn header-btn">➕</button>
          </div>
          <div className="trips-header-bottom">{/* filters*/}</div>
        </header>

        <ActiveTripCard activeTrip={ACTIVE_TRIP} />

        <section className="trips-section">
          <h3 className="section-title">Minulé výlety</h3>

          {MOCK_TRIPS.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </section>
      </div>
    </Layout>
  );
}

export default TripsPage;
