import Layout from "../components/Layout";
import TripPill from "../components/TripPill";

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
      </section>
    </Layout>
  );
}

export default TripsPage;
