import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/TripPill.css";
function TripPill({ activeTrip }) {
  const [duration, setDuration] = useState("");
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();

      const startedAt = new Date(activeTrip.startedAt);

      const diffMs = now - startedAt;

      const hours = Math.floor(diffMs / 1000 / 60 / 60);

      const minutes = Math.floor((diffMs / 1000 / 60) % 60);

      const seconds = Math.floor((diffMs / 1000) % 60);

      const formatted = [hours, minutes, seconds]
        .map((value) => String(value).padStart(2, "0"))
        .join(":");

      setDuration(formatted);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeTrip.startedAt]);
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
