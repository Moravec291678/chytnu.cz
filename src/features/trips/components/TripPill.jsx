import { Link } from "react-router-dom";
import "./TripPill.css";
import useLiveDuration from "../../../hooks/useLiveDuration";

function TripPill({ activeTrip }) {
  const duration = useLiveDuration(activeTrip.startedAt);
  return (
    <Link to={"/trips"} className="trip-pill-link">
      <div className="trip-pill">
        <div className="trip-pill-left">
          <div className="dot"></div>

          <div>
            <p className="trip-pill-title">
              {activeTrip.locationName} · aktivní výlet
            </p>

            <p className="trip-pill-subtitle">
              {activeTrip.method} · 3 chyceno dnes
            </p>
          </div>
        </div>

        <div className="trip-pill-timer">{duration}</div>
      </div>
    </Link>
  );
}

export default TripPill;
