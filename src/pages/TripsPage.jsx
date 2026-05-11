import Layout from "../components/Layout";
import TripCard from "../components/TripCard";
import ActiveTripCard from "../components/ActiveTripCard";

import { MOCK_TRIPS } from "../data/mockTrips";
import { ACTIVE_TRIP } from "../data/activeTrip";

import "../styles/TripsPage.css";

function TripsPage() {
  return (
    <Layout>
      <div className="trips-page">
        <header className="trips-header">
          <h1>Výlety</h1>

          <p className="trips-subtitle">12 výletů · 187 hodin · 42 úlovků</p>
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
