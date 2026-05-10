function TripCard({ trip }) {
  const start = new Date(trip.startedAt);
  const end = new Date(trip.endedAt);
  const diffMs = end - start;
  const hours = Math.floor(diffMs / 1000 / 60 / 60);
  const minutes = Math.floor((diffMs / 1000 / 60) % 60);
  const duration = `${hours}h ${minutes}m`;
  console.log(start);
  return (
    <div className="trip-card">
      <div className="trip-card-content">
        <p className="trip-card-location">{trip?.locationName}</p>
        <div className="trip-card-times">
          <span>{duration}</span>
        </div>
        <h3 className="trip-card-title">{trip?.title}</h3>

        <div className="trip-card-stats">
          <span>🎣 {trip?.stats.catchesCount}</span>

          <span>🐟 {trip?.stats.speciesCount}</span>

          <span>⚖️ {trip?.stats.biggestCatchKg} kg</span>
        </div>
      </div>
    </div>
  );
}

export default TripCard;
