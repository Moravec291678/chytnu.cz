import { Link, useParams } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { MASTERY_LEVELS } from "../features/progression/data/progression";
import { useProgression } from "../features/progression/context/progressionContextValue.js";
import { DEFAULT_SPECIES } from "../shared/constants/constants";
import { getSpeciesFacts } from "../features/species/data/speciesFacts.js";
import "./ProgressionPages.css";
import "./SpeciesMasteryPage.css";

export default function SpeciesMasteryPage() {
  const { speciesKey } = useParams();
  const { state } = useCatches();
  const species = DEFAULT_SPECIES.find((item) => item.key === speciesKey);
  const ledger = useProgression();
  const mastery = ledger.summary.mastery.find((item) => item.speciesKey === speciesKey);
  const catchCount = mastery?.catchCount ?? 0;
  const currentLevel = mastery?.level ?? 0;
  const masteryProgress = mastery?.progressCount ?? catchCount;
  const speciesFacts = getSpeciesFacts(species);

  if (state.loading || ledger.loading) {
    return <Layout><main className="progression-page"><p className="loading-state" role="status">Načítám mistrovství druhu…</p></main></Layout>;
  }
  if (state.error || ledger.error) {
    return <Layout><main className="progression-page"><p className="progression-item" role="alert">{state.error || ledger.error}</p></main></Layout>;
  }
  if (!species) {
    return <Layout><main className="progression-page"><h1>Druh nebyl nalezen</h1><Link to="/album">Zpět do alba</Link></main></Layout>;
  }

  return (
    <Layout>
      <main className="progression-page species-mastery-page">
        <header>
          <Link className="progression-back" to={`/species/${speciesKey}`}>← Detail druhu</Link>
          <h1>{species.label}</h1>
          <p>Mistrovství {currentLevel} / 5 · {catchCount} {catchCount === 1 ? "úlovek v historii" : "úlovků v historii"}</p>
        </header>

        <section className="mastery-summary" aria-label={`Mistrovství ${currentLevel} z 5`}>
          <div className="mastery-stars" aria-hidden="true">
            {Array.from({ length: MASTERY_LEVELS.length }, (_, index) => (
              <span className={index < currentLevel ? "mastery-star mastery-star--earned" : "mastery-star"} key={index}>
                {index < currentLevel ? "★" : "☆"}
              </span>
            ))}
          </div>
            <p>{mastery?.nextLevelAt ? `Další úroveň při ${mastery.nextLevelAt} úlovcích.` : mastery ? "Dosaženo nejvyššího stupně." : "První zaznamenaný úlovek odemkne druh."}</p>
          {!mastery && <strong className="mastery-undiscovered">Zatím neobjevený druh</strong>}
        </section>

        <section className="mastery-section" aria-labelledby="mastery-milestones-title">
          <h2 id="mastery-milestones-title">Milníky</h2>
          <ul className="mastery-milestones">
            {MASTERY_LEVELS.map((milestone) => {
              const completed = currentLevel >= milestone.level;
              const progress = Math.min(masteryProgress, milestone.catches);
              return (
                <li className={`mastery-milestone${completed ? " mastery-milestone--complete" : ""}`} key={milestone.level}>
                  <span className="mastery-check" aria-hidden="true">{completed ? "✓" : ""}</span>
                  <div className="mastery-milestone-content">
                    <h3>★ {milestone.level} · {milestone.catches === 1 ? "Poprvé" : `${milestone.catches}×`}</h3>
                    {completed ? (
                      <p>Milník dosažen · {progress} / {milestone.catches} úlovků</p>
                    ) : (
                      <>
                        <div className="mastery-progress" role="progressbar" aria-label={`${milestone.level}. hvězda mistrovství`} aria-valuemin="0" aria-valuemax={milestone.catches} aria-valuenow={progress}>
                          <span style={{ width: `${Math.min(100, (progress / milestone.catches) * 100)}%` }} />
                        </div>
                        <p>{progress} / {milestone.catches} úlovků</p>
                      </>
                    )}
                  </div>
                  <strong>+{milestone.xp} XP</strong>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mastery-facts" aria-labelledby="mastery-facts-title">
          <h2 id="mastery-facts-title">Fakta o druhu</h2>
          {currentLevel < 2 ? (
            <p>Fakta se odemknou na 2. úrovni mistrovství.</p>
          ) : speciesFacts ? (
            <ul>{speciesFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
          ) : (
            <p>Ověřená fakta pro tento druh zatím nejsou v katalogu dostupná.</p>
          )}
        </section>

        {mastery && currentLevel >= 3 && mastery.title && (
          <section className="mastery-title-card">
            <span>Titul úrovně {currentLevel}</span>
            <h2>{mastery.title}</h2>
          </section>
        )}
      </main>
    </Layout>
  );
}
