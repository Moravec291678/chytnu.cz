import { useCatches } from "../../catches/context/CatchContext";
import {
  getTopMethod,
  getReleasedPercentage,
  getTopRevier,
  getBiggestCatch,
} from "../utils/profileStats";
import "./ProfileStatsBar.css";

function ProfileStatsBar() {
  const { state } = useCatches();

  const topMethod = getTopMethod(state.catches);
  const releasedPercentage = getReleasedPercentage(state.catches);
  const topRevier = getTopRevier(state.catches);
  const topCatch = getBiggestCatch(state.catches);
  return (
    <div className="profile-stats-bar">
      <div className="profile-stat-card">
        <span className="profile-stat-value profile-stat-green">
          {topCatch.weightKg} kg
        </span>

        <span className="profile-stat-label">REKORD</span>
      </div>

      <div className="profile-stat-card">
        <span className="profile-stat-value profile-stat-gold profile-stat-value-small">
          {topMethod?.count || 0}x
        </span>

        <span className="profile-stat-label">
          {topMethod?.label?.toUpperCase() || "METODA"}
        </span>
      </div>

      <div className="profile-stat-card">
        <span className="profile-stat-value profile-stat-blue profile-stat-value-small">
          {topRevier?.count || 0}x
        </span>

        <span className="profile-stat-label">
          {" "}
          {topRevier?.label?.toUpperCase() || "REVÍR"}
        </span>
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
