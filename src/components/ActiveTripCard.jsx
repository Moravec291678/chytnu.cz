import "../styles/ActiveTripCard.css";
import { useState, useEffect } from "react";

function ActiveTripCard({ activeTrip }) {
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
    <div className="active-trip-card">
      <div className="active-trip-top">
        <div>
          <p className="active-trip-title">📍 {activeTrip.locationName}</p>

          <p className="active-trip-subtitle">
            {activeTrip.method} ·{" "}
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
          <p className="active-trip-stat-value">3</p>

          <p className="active-trip-stat-label">ÚLOVKY</p>
        </div>

        <div className="active-trip-stat">
          <p className="active-trip-stat-value">6.1</p>

          <p className="active-trip-stat-label">MAX KG</p>
        </div>

        <div className="active-trip-stat">
          <p className="active-trip-stat-value">2</p>

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
