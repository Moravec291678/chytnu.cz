import { Link } from "react-router-dom";
import { formatTripDuration, getTripDurationMs } from "../data/tripModel";
import "./TripCard.css";

function TripCard({ trip, catches = [] }) {
  const associated = catches.filter((item) => item.tripId === trip.id);
  const measuredWeights = associated.map((item) => item.weightKg).filter(Number.isFinite);
  const speciesCount = new Set(associated.map((item) => item.speciesKey)).size;
  return <Link to={`/trips/${trip.id}`} className="trip-card-link">
    <article className="trip-card">
      <div className="trip-card-top"><div><h3 className="trip-card-title">{trip.title}</h3><p className="trip-card-meta">{trip.locationName || "Lokalita neuvedena"} · {new Date(trip.startedAt).toLocaleDateString("cs-CZ")}</p></div><span className="trip-card-duration">{formatTripDuration(getTripDurationMs(trip))}</span></div>
      <div className="trip-card-stats"><span>{associated.length} {associated.length === 1 ? "úlovek" : "úlovků"}</span>{measuredWeights.length > 0 && <span>Nejvyšší zaznamenaná váha {Math.max(...measuredWeights)} kg</span>}<span>{speciesCount} {speciesCount === 1 ? "druh" : "druhů"}</span></div>
    </article>
  </Link>;
}

export default TripCard;
