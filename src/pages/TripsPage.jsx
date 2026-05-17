import Layout from "../shared/layout/Layout";
import TripCard from "../features/trips/components/TripCard";
import ActiveTripCard from "../features/trips/components/ActiveTripCard";
import { MOCK_TRIPS } from "../features/trips/data/mockTrips";
import { getActiveTrip } from "../features/trips/utils/getActiveTrip";
import {
  getTotalTripsHours,
  getTripsCount,
} from "../features/trips/utils/tripStats";
import { getCompletedTrips } from "../features/trips/utils/getCompletedTrips";
import "./TripsPage.css";

function TripsPage() {
  const activeTrip = getActiveTrip(MOCK_TRIPS);
  const completedTrips = getCompletedTrips(MOCK_TRIPS);
  const totalTripsHours = getTotalTripsHours(MOCK_TRIPS);
  return (
    <Layout>
      <div className="trips-page">
        <header className="trips-header">
          <div className="trips-header-top">
            <div className="trips-header-top-wrapper">
              <h1>Výlety</h1>

              <p className="trips-subtitle">
                {getTripsCount(MOCK_TRIPS)} výletů · {totalTripsHours} hodin
              </p>
            </div>
            <button className="trips-add-btn header-btn">➕</button>
          </div>
          <div className="trips-header-bottom">{/* filters*/}</div>
        </header>

        {activeTrip && <ActiveTripCard activeTrip={activeTrip} />}

        <section className="trips-section">
          <h3 className="section-title">Minulé výlety</h3>

          {completedTrips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </section>
      </div>
    </Layout>
  );
}

export default TripsPage;
