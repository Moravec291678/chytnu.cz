import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import { buildChallengeOverview } from "../features/progression/data/challenges";
import { buildSeasonalChallenge } from "../features/progression/data/seasonalChallenge";
import { useProgression } from "../features/progression/context/progressionContextValue.js";
import "./ProgressionPages.css";
import "./ChallengesPage.css";

function TaskList({ title, tasks, showProgress = false }) {
  return (
    <section className="challenge-section">
      <h2>{title}</h2>
      <ul className="challenge-list">
        {tasks.map((task) => (
          <li className={`challenge-row${task.completed ? " challenge-row--complete" : ""}`} key={task.id}>
            <span className="challenge-check" aria-hidden="true">{task.completed ? "✓" : ""}</span>
            <div className="challenge-row-content">
              <h3>{task.title}</h3>
              {showProgress && (
                <>
                  <div className="challenge-progress" role="progressbar" aria-label={task.title} aria-valuemin="0" aria-valuemax={task.goal} aria-valuenow={task.progress}>
                    <span style={{ width: `${Math.min(100, (task.progress / task.goal) * 100)}%` }} />
                  </div>
                  <p>{task.progressLabel}</p>
                </>
              )}
            </div>
            <strong className="challenge-xp">+{task.xp} XP</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ChallengesPage() {
  const { state: catchState } = useCatches();
  const { state: tripState } = useTrips();
  const ledger = useProgression();
  const currentOverview = buildChallengeOverview(catchState.catches, tripState.trips);
  const persist = (task) => ({ ...task, completed: task.completed || ledger.isChallengeCompleted(task.id, task.periodKey) });
  const overview = { daily: currentOverview.daily.map(persist), weekly: currentOverview.weekly.map(persist) };
  const currentSeasonal = buildSeasonalChallenge(catchState.catches);
  const seasonal = {
    ...currentSeasonal,
    variants: currentSeasonal.variants.map((variant) => ({
      ...variant,
      completed: variant.completed || ledger.isChallengeCompleted(variant.id, currentSeasonal.periodKey),
    })),
  };
  const loading = catchState.loading || tripState.loading || ledger.loading;
  const error = [catchState.error, tripState.error, ledger.error].filter(Boolean).join(" ");
  const catches = catchState.catches ?? [];
  const trips = tripState.trips ?? [];

  return (
    <Layout>
      <main className="progression-page challenges-page">
        <header>
          <Link className="progression-back" to="/">← Domů</Link>
          <h1>Výzvy</h1>
          <p>Denní · týdenní · sezónní</p>
        </header>
        {error && <p role="alert" className="challenge-error">{error}</p>}
        {loading ? (
          <p className="loading-state" role="status">Načítám výzvy…</p>
        ) : (
          <>
            {catches.length === 0 && trips.length === 0 && (
              <p className="challenge-no-activity">Zatím bez úlovků a vycházek. Postup se aktualizuje po prvním uloženém záznamu.</p>
            )}
            <TaskList title="Denní · 3 výzvy" tasks={overview.daily} />
            <TaskList title="Týdenní" tasks={overview.weekly} showProgress />
            <section className="challenge-season">
              <span className="challenge-season-kicker">{seasonal.season}</span>
              <h2>{seasonal.title}</h2>
              <p>{seasonal.description}</p>
              <div className={`challenge-season-variants${seasonal.variants.length === 1 ? " challenge-season-variants--single" : ""}`} role="list" aria-label="Cesty k dokončení sezónní výzvy">
                {seasonal.variants.map((variant) => (
                  <article className={`challenge-season-variant${variant.completed ? " challenge-season-variant--complete" : ""}`} key={variant.id} role="listitem">
                    <div className="challenge-season-variant-heading">
                      <h3>{variant.title}</h3>
                      <strong>{variant.progressLabel}</strong>
                    </div>
                    <p>{variant.description}</p>
                    <div className="challenge-season-variant-meter" role="progressbar" aria-label={variant.title} aria-valuemin="0" aria-valuemax={variant.goal} aria-valuenow={variant.progress}>
                      <span style={{ width: `${(variant.progress / variant.goal) * 100}%` }} />
                    </div>
                    <span className="challenge-season-variant-reward">{variant.completed ? "Splněno · " : "Odměna "}{variant.xp} XP</span>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </Layout>
  );
}
