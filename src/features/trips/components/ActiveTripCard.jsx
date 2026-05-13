import "./ActiveTripCard.css";
import useLiveDuration from "../../../hooks/useLiveDuration";
import { getMethodLabel } from "../../../shared/utils/getMethodLabel";

function ActiveTripCard({ activeTrip }) {
  const duration = useLiveDuration(activeTrip.startedAt);
  const activeTripMethod = getMethodLabel(activeTrip);
  return (
    <div className="active-trip-card">
      <div className="active-trip-top">
        <div>
          <p className="active-trip-title">📍 {activeTrip.locationName}</p>

          <p className="active-trip-subtitle">
            {activeTripMethod} ·{" "}
            {activeTrip.startedAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · dnes
          </p>
        </div>

        <div className="active-trip-timer">{duration}</div>
      </div>

      <div className="active-trip-stats">
        <div className="active-trip-stat">
          <p className="active-trip-stat-value">
            {activeTrip.stats.catchesCount}
          </p>

          <p className="active-trip-stat-label">ÚLOVKY</p>
        </div>

        <div className="active-trip-stat">
          <p className="active-trip-stat-value">6.1</p>

          <p className="active-trip-stat-label">MAX KG</p>
        </div>

        <div className="active-trip-stat">
          <p className="active-trip-stat-value">
            {activeTrip.stats.speciesCount}
          </p>

          <p className="active-trip-stat-label">DRUHY</p>
        </div>

        <div className="active-trip-stat">
          <p className="active-trip-stat-value">1.0</p>

          <p className="active-trip-stat-label">ZÁBĚR/H</p>
        </div>
      </div>
    </div>
  );
}

export default ActiveTripCard;
