import { Link } from "react-router-dom";
import { formatTripCatchCount, formatTripDuration, getDistinctTripSpecies, getTripDurationMs } from "../data/tripModel";
import { FishMark } from "../../catches/components/CatchCard";
import "./TripCard.css";

function TripCard({ trip, catches = null }) {
  const catchesAvailable = Array.isArray(catches);
  const associated = catchesAvailable ? catches.filter((item) => item.tripId === trip.id) : [];
  const measuredWeights = associated.map((item) => item.weightKg).filter(Number.isFinite);
  const species = catchesAvailable ? getDistinctTripSpecies(associated) : [];
  const speciesNoun = species.length === 1 ? "druh" : species.length >= 2 && species.length <= 4 ? "druhy" : "druhů";
  return <Link to={`/trips/${trip.id}`} className="trip-card-link">
    <article className="trip-card">
      <div className="trip-card-top"><div><h3 className="trip-card-title">{trip.title}</h3><p className="trip-card-meta">{trip.locationName || "Lokalita neuvedena"} · {new Date(trip.startedAt).toLocaleDateString("cs-CZ")}</p></div><span className="trip-card-duration">{formatTripDuration(getTripDurationMs(trip))}</span></div>
      <div className="trip-card-stats">
        <span>{catchesAvailable ? formatTripCatchCount(associated.length) : "Úlovky nedostupné"}</span>
        {measuredWeights.length > 0 && <span>max <strong>{Math.max(...measuredWeights).toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} kg</strong></span>}
        {catchesAvailable && <span>{species.length} {speciesNoun}</span>}
      </div>
      {species.length > 0 && <div className="trip-card-species" aria-label="Druhy zaznamenané na výpravě">
        {species.slice(0, 5).map((item) => (
          <span className="trip-species-mark" key={item.speciesKey || item.species} role="img" aria-label={item.species} title={item.species}>
            <FishMark speciesKey={item.speciesKey} />
          </span>
        ))}
        {species.length > 5 && <span className="trip-species-overflow" aria-label={`Dalších ${species.length - 5} druhů`}>+{species.length - 5}</span>}
      </div>}
    </article>
  </Link>;
}

export default TripCard;
