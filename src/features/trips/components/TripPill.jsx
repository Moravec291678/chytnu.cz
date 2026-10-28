import { Link } from "react-router-dom";
import "./TripPill.css";
import useLiveDuration from "../../../hooks/useLiveDuration";
import { getMethodLabel } from "../../../shared/utils/getMethodLabel";

function TripPill({ activeTrip }) {
  const activeTripMethod = getMethodLabel(activeTrip);
  const duration = useLiveDuration(activeTrip.startedAt);
  return (
    <Link to={"/trips"} className="trip-pill-link">
      <div className="trip-pill">
        <div className="trip-pill-left">
          <div className="dot"></div>

          <div>
            <p className="trip-pill-title">
              {activeTrip.locationName} · aktivní vycházka
            </p>

            <p className="trip-pill-subtitle">
              {activeTripMethod} · {activeTrip.stats.catchesCount} chyceno
            </p>
          </div>
        </div>

        <div className="trip-pill-timer">{duration}</div>
      </div>
    </Link>
  );
}

export default TripPill;
