import "../styles/TripCard.css";

function TripCard({ trip }) {
  const start = new Date(trip.startedAt);
  const end = new Date(trip.endedAt);

  const diffMs = end - start;

  const hours = Math.floor(diffMs / 1000 / 60 / 60);

  const minutes = Math.floor((diffMs / 1000 / 60) % 60);

  const duration = `${hours}h ${minutes}m`;

  return (
    <div className="trip-card">
      <div className="trip-card-top">
        <div>
          <h3 className="trip-card-title">{trip?.title}</h3>

          <p className="trip-card-meta">{trip?.locationName}</p>
        </div>

        <span className="trip-card-duration">{duration}</span>
      </div>

      <div className="trip-card-stats">
        <span>🎣 {trip?.stats?.catchesCount} úlovků</span>

        <span>⚖️ max {trip?.stats?.biggestCatchKg} kg</span>

        <span>🐟 {trip?.stats?.speciesCount} druhy</span>
      </div>

      <div className="trip-card-species">
        {trip?.speciesKeys?.map((species) => (
          <span key={species} className="trip-species-pill">
            {species}
          </span>
        ))}
      </div>
    </div>
  );
}

export default TripCard;
