import "./ActiveTripCard.css";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useLiveDuration from "../../../hooks/useLiveDuration";
import { getMethodLabel } from "../../../shared/utils/getMethodLabel";
import { getStartedTripDayLabel } from "../utils/getStartedTripDayLabel";
import { Link } from "react-router-dom";
import { useTrips } from "../context/useTrips";
import { getDistinctTripSpecies, getTripCatchRatePerHour, getTripDurationMs } from "../data/tripModel";

function ActiveTripCard({ activeTrip, catches = null }) {
  const navigate = useNavigate();
  const { endTrip } = useTrips();
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState("");
  const endingRef = useRef(false);
  const duration = useLiveDuration(activeTrip.startedAt);
  const activeTripMethod = getMethodLabel(activeTrip);
  const activeTripDayLabel = getStartedTripDayLabel(activeTrip);
  const hasCatchData = Array.isArray(catches);
  const tripCatches = hasCatchData ? catches.filter((item) => item.tripId === activeTrip.id) : [];
  const measuredWeights = tripCatches.map((item) => item.weightKg).filter(Number.isFinite);
  const speciesCount = hasCatchData ? getDistinctTripSpecies(tripCatches).length : null;
  const catchRate = hasCatchData ? getTripCatchRatePerHour(tripCatches.length, getTripDurationMs(activeTrip)) : null;
  const finishTrip = async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setEnding(true);
    setError("");
    try {
      await endTrip(activeTrip);
      navigate("/trips", { replace: true });
    } catch (finishError) {
      setError(finishError.message || "Výpravu se nepodařilo ukončit.");
      endingRef.current = false;
      setEnding(false);
    }
  };
  return (
    <div className="active-trip-card">
      <div className="active-trip-top">
        <div>
          <p className="active-trip-title">{activeTrip.title}</p>
          <p className="active-trip-subtitle">
            {activeTrip.locationName || "Lokalita neuvedena"} · {activeTripMethod || "Metoda neuvedena"} ·{" "}
            {new Date(activeTrip.startedAt).toLocaleTimeString("cs-CZ", {
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
            })}
          </p>
          <p className="active-trip-subtitle">{activeTripDayLabel}</p>
        </div>

        <div className="active-trip-timer">{duration}</div>
      </div>

      <div className="active-trip-stats">
        <div className="active-trip-stat">
          <p className="active-trip-stat-value">{hasCatchData ? tripCatches.length : "—"}</p>

          <p className="active-trip-stat-label">ÚLOVKY</p>
        </div>

        <div className="active-trip-stat">
          <p className="active-trip-stat-value">{measuredWeights.length ? Math.max(...measuredWeights).toLocaleString("cs-CZ", { maximumFractionDigits: 2 }) : "—"}</p>

          <p className="active-trip-stat-label">MAX KG</p>
        </div>

        <div className="active-trip-stat">
          <p className="active-trip-stat-value">{speciesCount ?? "—"}</p>

          <p className="active-trip-stat-label">DRUHY</p>
        </div>

        <div className="active-trip-stat">
          <p className="active-trip-stat-value">{catchRate === null ? "—" : catchRate.toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</p>

          <p className="active-trip-stat-label">ÚLOVKY/H</p>
        </div>

      </div>
      {error && <p className="active-trip-error" role="alert">{error}</p>}
      <div className="active-trip-actions">
        <Link className="active-trip-add" to="/add">Zapsat úlovek</Link>
        <button className="active-trip-finish" type="button" onClick={finishTrip} disabled={ending}>{ending ? "Ukončuji…" : "Ukončit výpravu"}</button>
      </div>
      <Link className="active-trip-open" to={`/trips/${activeTrip.id}`}>Detail výpravy →</Link>
    </div>
  );
}

export default ActiveTripCard;
