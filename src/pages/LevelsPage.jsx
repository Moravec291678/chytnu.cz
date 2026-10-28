import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import { RANKS } from "../features/progression/data/progression";
import { XP_RULES } from "../features/progression/data/xpRules.js";
import { RARITY_LEVELS } from "../features/catches/utils/rarity.js";
import { useProgression } from "../features/progression/context/progressionContextValue.js";
import "./ProgressionPages.css";
import "./LevelsPage.css";

export default function LevelsPage() {
  const { state: catchState } = useCatches();
  const { state: tripState } = useTrips();
  const ledger = useProgression();
  const progression = ledger.summary;
  const errors = [catchState.error, tripState.error].filter(Boolean).join(" ");
  const catches = catchState.catches ?? [];
  const trips = tripState.trips ?? [];
  const xpRules = [
    ["Záznam úlovku", XP_RULES.catch.base],
    ["Záznam s fotkou", XP_RULES.catch.photo],
    ["Záznam s GPS a počasím", XP_RULES.catch.gpsAndWeather],
    ["Nový druh", XP_RULES.newSpecies],
    ["Nový revír", XP_RULES.newWater],
    ["Denní výzva", XP_RULES.dailyChallenge],
    ["Týdenní výzva", XP_RULES.weeklyChallenge],
    ["Každý 7. týden série", XP_RULES.streakBonus],
    ["Achievement", `${XP_RULES.achievement.min} až ${XP_RULES.achievement.max}`],
    ["Příspěvek do komunity", XP_RULES.communityContribution],
    ["Veřejné sdílení", XP_RULES.publicShare],
  ];
  const rarities = Object.values(RARITY_LEVELS);
  const levelInterval = progression.nextThreshold === null
    ? null
    : progression.nextThreshold - progression.currentThreshold;
  const xpWithinLevel = progression.xp - progression.currentThreshold;
  const xpToNextLevel = progression.nextThreshold === null
    ? 0
    : progression.nextThreshold - progression.xp;

  return (
    <Layout>
      <main className="progression-page levels-page">
        <header>
          <Link className="progression-back" to="/profile">← Profil</Link>
          <h1>Úrovně a XP</h1>
          <p>Jak se rozvíjíš</p>
        </header>
        {catchState.loading || tripState.loading || ledger.loading ? (
          <p className="loading-state" role="status">Načítám rybářský postup…</p>
        ) : errors || ledger.error ? (
          <p className="progression-item" role="alert">{errors || ledger.error}</p>
        ) : (
          <>
            {catches.length === 0 && trips.length === 0 && (
              <p className="level-no-activity">Zatím bez úlovků a vycházek. Tvoje úroveň začne růst s prvními uloženými aktivitami.</p>
            )}
            <section className="level-summary">
              <span className="level-rank-name">{progression.rank.name}</span>
              <div className="level-summary-heading">
                <h2>Level {progression.level}</h2>
                <span>{progression.xp.toLocaleString("cs-CZ")} XP celkem</span>
              </div>
              <p>{progression.rank.title}</p>
              <div className="progression-progress" role="progressbar" aria-label="Postup do další úrovně" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progression.progressPercent}>
                <span style={{ width: `${progression.progressPercent}%` }} />
              </div>
              {levelInterval === null ? (
                <p className="level-progress-caption">Maximální úroveň</p>
              ) : (
                <p className="level-progress-caption">
                  {xpWithinLevel.toLocaleString("cs-CZ")} / {levelInterval.toLocaleString("cs-CZ")} XP v této úrovni
                  <span>{xpToNextLevel.toLocaleString("cs-CZ")} XP do další</span>
                </p>
              )}
            </section>

            <section className="level-section" aria-labelledby="level-xp-title">
              <h2 id="level-xp-title">Jak získat XP</h2>
              {xpRules.length > 0 ? (
                <ul className="level-xp-list">
                  {xpRules.map(([label, value]) => (
                    <li key={label}><span>{label}</span><strong>+{typeof value === "number" ? value.toLocaleString("cs-CZ") : value}</strong></li>
                  ))}
                </ul>
              ) : (
                <p className="level-empty-xp">Pravidla XP nejsou dostupná.</p>
              )}
              <p className="level-rule-note">Úroveň vychází z uloženého postupu. Odměny za komunitní příspěvky zatím nejsou dostupné.</p>
            </section>

            <section className="level-section" aria-labelledby="level-ranks-title">
              <h2 id="level-ranks-title">Ranky</h2>
              <ul className="level-rank-list">
              {RANKS.map((rank) => {
                  const isCurrent = progression.level >= rank.minLevel && progression.level <= rank.maxLevel;
                  const isEarned = progression.level > rank.maxLevel;
                  return (
                    <li className={`level-rank-row${isCurrent ? " level-rank-row--current" : isEarned ? " level-rank-row--earned" : ""}`} key={rank.name}>
                      <div>
                      <strong>{rank.minLevel === rank.maxLevel ? rank.minLevel : `${rank.minLevel}–${rank.maxLevel}`} · {rank.name}</strong>
                        <p>{rank.title}</p>
                      </div>
                      {isCurrent && <span>Teď</span>}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="level-section level-rarity" aria-labelledby="level-rarity-title">
              <h2 id="level-rarity-title">Rarity úlovků</h2>
              <ul className="level-rarity-list">
                {rarities.map((rarity) => (
                  <li className={`level-rarity level-rarity--${rarity.color}`} key={rarity.key}>
                    <strong>{rarity.label}</strong><span>{rarity.rule}</span>
                    {rarity.key === "legendary" && <b>+{XP_RULES.legendaryRarity} XP</b>}
                  </li>
                ))}
              </ul>
              <p className="level-rule-note">Rarity určuje stabilní pravidlo podle ověřené hmotnosti, délky a vlastností druhu.</p>
            </section>

            <Link className="progression-link" to="/achievements">Prohlédnout úspěchy <span>→</span></Link>
          </>
        )}
      </main>
    </Layout>
  );
}
