import Layout from "../components/Layout";
import TripCard from "../components/TripCard";
import TripPill from "../components/TripPill";
import { MOCK_TRIPS } from "../data/mockTrips";
import { ACTIVE_TRIP } from "../data/activeTrip";

function TripsPage() {
  return (
    <Layout>
      <header className="trips-header">
        <h1>Výlety</h1>

        <p>Tvoje rybářské výpravy a aktivní session</p>
      </header>

      <TripPill activeTrip={ACTIVE_TRIP} />

      <section className="trips-section">
        <h3 className="section-title">Poslední výlety</h3>
        {MOCK_TRIPS.map((trip) => {
          return <TripCard key={trip.id} trip={trip} />;
        })}
      </section>
    </Layout>
  );
}

export default TripsPage;
