import { useCatches } from "../../catches/context/useCatches";
import { getAvailableProfileStats } from "../utils/profileStats";
import "./ProfileStatsBar.css";

function ProfileStatsBar() {
  const { state } = useCatches();
  const stats = getAvailableProfileStats(state.catches);

  if (stats.length === 0) {
    if (state.catches.length === 0) return null;
    return <p className="profile-stats-empty">Souhrn se zobrazí, až budou mít úlovky vyplněnou hmotnost, metodu, lokalitu nebo výsledek.</p>;
  }

  return (
    <>
      <div className="profile-stats-bar" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }} aria-label="Souhrn úlovků">
        {stats.map((stat) => (
          <div className="profile-stat-card" key={stat.key}>
            <span className={`profile-stat-value profile-stat-${stat.tone}`}>
              {stat.value}
            </span>
            <span className="profile-stat-label">{stat.label}</span>
          </div>
        ))}
      </div>
      {stats.length < 4 && <p className="profile-stats-note">Souhrn ukazuje jen údaje zaznamenané u úlovků.</p>}
    </>
  );
}

export default ProfileStatsBar;
