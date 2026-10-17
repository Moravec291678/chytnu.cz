import "./ActiveTripCard.css";
import useLiveDuration from "../../../hooks/useLiveDuration";
import { getMethodLabel } from "../../../shared/utils/getMethodLabel";
import { getStartedTripDayLabel } from "../utils/getStartedTripDayLabel";
import { Link } from "react-router-dom";

function ActiveTripCard({ activeTrip, catches = [] }) {
  const duration = useLiveDuration(activeTrip.startedAt);
  const activeTripMethod = getMethodLabel(activeTrip);
  const activeTripDayLabel = getStartedTripDayLabel(activeTrip);
  const tripCatches = catches.filter((item) => item.tripId === activeTrip.id);
  const measuredWeights = tripCatches.map((item) => item.weightKg).filter(Number.isFinite);
  const speciesCount = new Set(tripCatches.map((item) => item.speciesKey)).size;
  return (
    <div className="active-trip-card">
      <div className="active-trip-top">
        <div>
          <p className="active-trip-title">{activeTrip.title}</p>
          <p className="active-trip-subtitle">
            {activeTrip.locationName || "Lokalita neuvedena"} · {activeTripMethod || "Metoda neuvedena"} ·{" "}
            {new Date(activeTrip.startedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="active-trip-subtitle">{activeTripDayLabel}</p>
        </div>

        <div className="active-trip-timer">{duration}</div>
      </div>

      <div className="active-trip-stats">
        <div className="active-trip-stat">
          <p className="active-trip-stat-value">
            {tripCatches.length}
          </p>

          <p className="active-trip-stat-label">ÚLOVKY</p>
        </div>

        <div className="active-trip-stat">
          <p className="active-trip-stat-value">{measuredWeights.length ? `${Math.max(...measuredWeights)} kg` : "—"}</p>

          <p className="active-trip-stat-label">MAX KG</p>
        </div>

        <div className="active-trip-stat">
          <p className="active-trip-stat-value">
            {speciesCount}
          </p>

          <p className="active-trip-stat-label">DRUHY</p>
        </div>

      </div>
      <Link className="active-trip-open" to={`/trips/${activeTrip.id}`}>Otevřít aktivní výpravu</Link>
    </div>
  );
}

export default ActiveTripCard;
