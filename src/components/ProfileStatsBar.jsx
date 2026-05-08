import { useCatches } from "../context/CatchContext";
import {
  getTopMethod,
  getReleasedPercentage,
  getTopRevier,
} from "../utils/profileStats";
import "../styles/ProfileStatsBar.css";

function ProfileStatsBar() {
  const { state } = useCatches();

  const topMethod = getTopMethod(state.catches);
  const releasedPercentage = getReleasedPercentage(state.catches);
  const topRevier = getTopRevier(state.catches);
  return (
    <div className="profile-stats-bar">
      <div className="profile-stat-card">
        <span className="profile-stat-value profile-stat-green">0 kg</span>

        <span className="profile-stat-label">REKORD</span>
      </div>

      <div className="profile-stat-card">
        <span className="profile-stat-value profile-stat-gold profile-stat-value-small">
          🎣{topMethod?.label || "Žádná"}
        </span>

        <span className="profile-stat-label">TOP METODA</span>
      </div>

      <div className="profile-stat-card">
        <span className="profile-stat-value profile-stat-blue profile-stat-value-small">
          🌊 {topRevier?.label}
        </span>

        <span className="profile-stat-label">TOP REVÍR</span>
      </div>

      <div className="profile-stat-card">
        <span className="profile-stat-value profile-stat-green">
          {releasedPercentage}%
        </span>

        <span className="profile-stat-label">PUŠTĚNO</span>
      </div>
    </div>
  );
}

export default ProfileStatsBar;
