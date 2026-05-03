import { MOON_PHASE_EMOJI } from "../utils/constants";
function SpeciesCard({ speciesKey, data, biggest }) {
  return (
    <div className="species-card">
      <div className="species-card-main">
        <div className="species-card-icon">🐟</div>
        <div className="species-card-info">
          <h2>{biggest.species}</h2>
          <p>
            📍{biggest.locationName} · 🎣 {biggest.method?.label}
          </p>
          {biggest.isPersonalBest && <p>🏆 Osobní rekord</p>}
          {biggest.isSpeciesBest && <p>🥇 Rekord druhu</p>}
          {biggest.result === "released" && <p>↩️ Puštěno</p>}
          {biggest.result === "kept" && <p>🧊 Necháno</p>}
        </div>
        <div className="species-card-right">
          <p>{biggest.weightKg} kg</p>
          <p>{biggest.lengthCm} cm</p>
          <p>{data.count}x</p>
        </div>
      </div>
      <div className="species-card-footer">
        <p>
          📅{" "}
          {biggest.caughtAt.toLocaleDateString("cs-CZ", {
            day: "numeric",
            month: "numeric",
          })}{" "}
          ·{" "}
          {biggest.caughtAt.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </p>
        <p>⏱️ {biggest.fightMinutes ? `${biggest.fightMinutes} min` : "-"}</p>
        <p>{MOON_PHASE_EMOJI[biggest.conditions?.moonPhase] || "-"}</p>
      </div>
    </div>
  );
}

export default SpeciesCard;
