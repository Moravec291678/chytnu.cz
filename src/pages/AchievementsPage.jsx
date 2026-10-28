import { useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import { useProgression } from "../features/progression/context/progressionContextValue.js";
import "./ProgressionPages.css";

export default function AchievementsPage() {
  const [activeCategory, setActiveCategory] = useState("Úlovky");
  const { state: catchState } = useCatches();
  const { state: tripState } = useTrips();
  const ledger = useProgression();
  const progression = ledger.summary;
  const loading = catchState.loading || tripState.loading || ledger.loading;
  const visibleAchievements = progression.achievements.filter((item) => !item.hidden || item.isCompleted);
  const groups = [...new Set(visibleAchievements.map((item) => item.category))];
  const unearnedHidden = progression.achievements.filter((item) => item.hidden && !item.isCompleted);
  const completedVisible = visibleAchievements.filter((item) => item.isCompleted).length;
  const errors = [catchState.error, tripState.error, ledger.error].filter(Boolean).join(" ");
  const achievementsInCategory = visibleAchievements.filter((item) => item.category === activeCategory);
  const catches = catchState.catches ?? [];
  const trips = tripState.trips ?? [];

  return (
    <Layout>
      <main className="progression-page achievements-page">
        <header>
          <Link className="progression-back" to="/profile">← Profil</Link>
          <h1>Achievementy</h1>
          <p>{completedVisible} z {visibleAchievements.length} splněno</p>
        </header>
        {loading ? (
          <p className="loading-state" role="status">Načítám achievementy…</p>
        ) : errors ? (
          <p className="progression-item" role="alert">{errors}</p>
        ) : (
          <>
            {catches.length === 0 && trips.length === 0 && (
              <p className="achievements-no-activity">Zatím bez úlovků a vycházek. Achievementy se průběžně vyhodnocují z tvých záznamů.</p>
            )}
            <nav className="achievements-categories" aria-label="Kategorie achievementů">
              {groups.map((category) => (
                <button
                  type="button"
                  className={activeCategory === category ? "achievements-category achievements-category--active" : "achievements-category"}
                  aria-pressed={activeCategory === category}
                  key={category}
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </button>
              ))}
            </nav>
            <section className="achievements-list" aria-label={activeCategory}>
              {achievementsInCategory.map((item) => (
                <article className={`achievement-row${item.isCompleted ? " achievement-row--complete" : ""}`} key={item.id}>
                  <span className="achievement-check" aria-hidden="true">{item.isCompleted ? "✓" : ""}</span>
                  <div className="achievement-content">
                    <h2>{item.title}</h2>
                    <p>{item.rule}</p>
                    {!item.isCompleted && item.progress !== undefined && (
                      <div className="achievement-progress" role="progressbar" aria-label={item.title} aria-valuemin="0" aria-valuemax={item.target} aria-valuenow={item.progress}>
                        <span style={{ width: `${Math.min(100, (item.progress / item.target) * 100)}%` }} />
                      </div>
                    )}
                  </div>
                  <strong className="achievement-value">
                    {item.isCompleted
                      ? `+${item.xp} XP`
                      : item.progress !== undefined
                        ? `${new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(item.progress)} / ${item.target}${item.progressUnit ? ` ${item.progressUnit}` : ""}`
                        : "Zamčeno"}
                  </strong>
                </article>
              ))}
            </section>
            {unearnedHidden.length > 0 && (
              <section className="achievements-hidden" aria-labelledby="achievements-hidden-title">
                <h2 id="achievements-hidden-title">Skryté</h2>
                <div className="achievements-hidden-list">
                  {unearnedHidden.map((item) => (
                    <span className="achievement-hidden-mark" aria-label="Skrytý achievement" key={item.id}>?</span>
                  ))}
                </div>
                <p>Odhalí se, až splníš některý ze skrytých achievementů.</p>
              </section>
            )}
          </>
        )}
      </main>
    </Layout>
  );
}
