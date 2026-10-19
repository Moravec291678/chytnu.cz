import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { useProgression } from "../features/progression/context/progressionContextValue.js";
import "./ProgressionPages.css";
import "./StreakPage.css";

function formatWeeks(weeks) {
  if (weeks === 1) return "1 týden";
  if (weeks >= 2 && weeks <= 4) return `${weeks} týdny`;
  return `${weeks} týdnů`;
}

export default function StreakPage() {
  const { state } = useCatches();
  const catches = state.catches ?? [];
  const ledger = useProgression();
  const streak = ledger.summary.streak;
  const nextBonusProgress = streak.weeks % 7;
  const milestones = [4, 12, 52];
  const nextMilestone = milestones.find((weeks) => weeks > streak.weeks) ?? null;

  return (
    <Layout>
      <main className="progression-page streak-page">
        <header>
          <Link className="progression-back" to="/profile">← Profil</Link>
          <h1>Série</h1>
          <p>Alespoň jeden uložený úlovek v každém navazujícím týdnu.</p>
        </header>
        {state.loading || ledger.loading ? (
          <p className="loading-state" role="status">Načítám sérii…</p>
        ) : state.error || ledger.error ? (
          <p className="progression-item" role="alert">{state.error || ledger.error}</p>
        ) : (
          <>
            {catches.length === 0 && (
              <p className="streak-no-activity">Série začne po zaznamenání prvního úlovku.</p>
            )}
            <section className="streak-summary" aria-label="Aktuální série">
              <span className="streak-state">{streak.isActive ? "Aktivní" : "Čeká na nový úlovek"}</span>
              <strong className="streak-count">{streak.weeks}</strong>
              <span className="streak-count-label">{streak.weeks === 1 ? "týden v řadě" : streak.weeks >= 2 && streak.weeks <= 4 ? "týdny v řadě" : "týdnů v řadě"}</span>
              <div className="streak-week-track" aria-label={`${nextBonusProgress} z 7 týdnů k dalšímu bonusu`}>
                {Array.from({ length: 7 }, (_, index) => (
                  <span className={index < nextBonusProgress ? "streak-week streak-week--active" : "streak-week"} key={index} />
                ))}
              </div>
              {streak.lastCatchAt && (
                <p>Poslední aktivita: {new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" }).format(new Date(streak.lastCatchAt))}</p>
              )}
            </section>

            <section className="streak-details" aria-label="Série a odměny">
              <article>
                <div>
                  <h2>Zmrazení série</h2>
                  <p>Není dostupné</p>
                </div>
                <button type="button" disabled>Použít</button>
              </article>
              <article>
                <div>
                  <h2>Bonus série</h2>
                  <p>+50 XP po 7 aktivních týdnech</p>
                </div>
                <span>{nextBonusProgress} / 7</span>
              </article>
              <article>
                <div>
                  <h2>{nextMilestone ? "Další odznak" : "Všechny odznaky"}</h2>
                  <p>{nextMilestone ? `${formatWeeks(nextMilestone)} v řadě` : "Nejvyšší milník dosažen"}</p>
                </div>
                <span>{nextMilestone ? `${streak.weeks} / ${nextMilestone}` : `${milestones.at(-1)} / ${milestones.at(-1)}`}</span>
              </article>
            </section>

            <section className="streak-milestones" aria-label="Milníky série">
              {milestones.map((weeks) => (
                <div className={ledger.events.some((event) => event.reasonKey === `streak.milestone:${weeks}`) ? "streak-milestone streak-milestone--complete" : "streak-milestone"} key={weeks}>
                  <span>{ledger.events.some((event) => event.reasonKey === `streak.milestone:${weeks}`) ? "✓" : weeks}</span>
                </div>
              ))}
            </section>

            <p className="progression-muted">Série nemá zmrazení a počítá se výhradně z uložených úlovků.</p>
          </>
        )}
      </main>
    </Layout>
  );
}
