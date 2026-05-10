function TripCard({ trip }) {
  return (
    <div className="trip-card">
      <div className="trip-card-content">
        <p className="trip-card-location">{trip.locationName}</p>

        <h3 className="trip-card-title">{trip.title}</h3>

        <div className="trip-card-stats">
          <span>🎣 {trip.stats.catchesCount}</span>

          <span>🐟 {trip.stats.speciesCount}</span>

          <span>⚖️ {trip.stats.biggestCatchKg} kg</span>
        </div>
      </div>
    </div>
  );
}

export default TripCard;
