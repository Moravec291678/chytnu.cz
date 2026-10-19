import { useMemo } from "react";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import CatchCard from "../features/catches/components/CatchCard";
import FishActivity from "../features/home/components/FishActivity";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import { getBiggestCatch } from "../features/home/utils/profileStats";
import { getActiveTrip } from "../features/trips/data/tripModel";
import { getMethodLabel } from "../shared/utils/getMethodLabel";
import useLiveDuration from "../hooks/useLiveDuration";
import { buildChallengeOverview } from "../features/progression/data/challenges";
import { buildSeasonalChallenge } from "../features/progression/data/seasonalChallenge";
import { buildHomeInsight } from "../features/home/utils/homeInsights";
import { useProgression } from "../features/progression/context/progressionContextValue.js";
import "./HomePage.css";

const SEASONS = [
  { key: "winter", label: "Zima", months: [11, 0, 1] },
  { key: "spring", label: "Jaro", months: [2, 3, 4] },
  { key: "summer", label: "Léto", months: [5, 6, 7] },
  { key: "autumn", label: "Podzim", months: [8, 9, 10] },
];

function getSeason(date) {
  const month = date.getMonth();
  const season = SEASONS.find((item) => item.months.includes(month));
  const year = month === 11 ? date.getFullYear() + 1 : date.getFullYear();
  return {
    label: season.label,
    year,
    key: `${year}-${season.key}`,
  };
}

function getSeasonKey(date) {
  const season = SEASONS.find((item) => item.months.includes(date.getMonth()));
  const year = date.getMonth() === 11 ? date.getFullYear() + 1 : date.getFullYear();
  return `${year}-${season.key}`;
}

function pluralize(count, forms) {
  const remainder = count % 100;
  if (remainder >= 11 && remainder <= 14) return forms[2];
  const lastDigit = count % 10;
  if (lastDigit === 1) return forms[0];
  if (lastDigit >= 2 && lastDigit <= 4) return forms[1];
  return forms[2];
}

function formatWeight(weight) {
  return new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(weight);
}

function ActiveTripSummary({ trip, catches }) {
  const duration = useLiveDuration(trip.startedAt);
  const tripCatches = catches.filter((item) => item.tripId === trip.id);
  const today = new Date().toDateString();
  const catchesToday = tripCatches.filter(
    (item) => item.caughtAt && new Date(item.caughtAt).toDateString() === today,
  ).length;

  return (
    <Link className="home-active-trip" to={`/trips/${trip.id}`}>
      <span className="home-active-dot" aria-hidden="true" />
      <span className="home-active-copy">
        <strong>{trip.locationName || trip.title} · aktivní výprava</strong>
        <span>{getMethodLabel(trip) || "Metoda neuvedena"} · {catchesToday} {pluralize(catchesToday, ["úlovek dnes", "úlovky dnes", "úlovků dnes"])}</span>
      </span>
      <time className="home-active-timer">{duration}</time>
    </Link>
  );
}

function SeasonalChallengeCard({ challenge }) {
  return (
    <section className="home-progress-card home-season-card" aria-labelledby="home-season-title">
      <div className="home-progress-heading">
        <span className="home-progress-kicker">Výzva sezóny · {challenge.season}</span>
        <Link to="/challenges">Detaily <span aria-hidden="true">→</span></Link>
      </div>
      <h2 id="home-season-title">{challenge.title}</h2>
      <p>
        {challenge.description}
        {challenge.season === "Podzim" && challenge.bestCatch && (
          <> Tvůj nejlepší kapr:{" "}
            {challenge.bestCatch.id
              ? <Link to={`/catch/${challenge.bestCatch.id}`}>{formatWeight(challenge.bestCatch.weightKg)} kg</Link>
              : <strong>{formatWeight(challenge.bestCatch.weightKg)} kg</strong>}
            .
          </>
        )}
      </p>
      <div className="home-progress-meter" role="progressbar" aria-label={challenge.title} aria-valuemin="0" aria-valuemax={challenge.goal} aria-valuenow={challenge.progress}>
        <span style={{ width: `${(challenge.progress / challenge.goal) * 100}%` }} />
      </div>
      <div className="home-progress-foot">
        <span>{challenge.progressLabel} {pluralize(challenge.progress, ["úlovek", "úlovky", "úlovků"])}</span>
        <strong>{challenge.completed ? `Splněno · +${challenge.xp} XP` : `Odměna ${challenge.xp} XP`}</strong>
      </div>
    </section>
  );
}

function WeeklyProgressCard({ tasks, streak }) {
  const completedCount = tasks.filter((task) => task.completed).length;
  return (
    <section className="home-progress-card home-week-card" aria-label="Týdenní pokrok">
      <div className="home-progress-heading">
        <span className="home-progress-kicker">Tento týden · {completedCount}/{tasks.length} splněno</span>
        <Link to="/challenges">Všechny výzvy <span aria-hidden="true">→</span></Link>
      </div>
      <Link className="home-streak-summary" to="/streak">
        <span>Série u vody</span>
        <strong>{streak.weeks} {pluralize(streak.weeks, ["týden", "týdny", "týdnů"])}</strong>
        <span className="home-streak-bars" role="img" aria-label={`Série má ${streak.weeks} ${pluralize(streak.weeks, ["týden", "týdny", "týdnů"])}, zobrazeno v osmi dílech`}>
          {Array.from({ length: 8 }, (_, index) => (
            <span className={index < Math.min(streak.weeks, 8) ? "home-streak-bar home-streak-bar--active" : "home-streak-bar"} key={index} aria-hidden="true" />
          ))}
        </span>
        <span className="home-streak-arrow" aria-hidden="true">→</span>
      </Link>
      <ul className="home-week-tasks">
        {tasks.map((task) => (
          <li
            key={task.id}
            className={`home-week-task${task.completed ? " home-week-task--complete" : ""}${task.id.startsWith("weekly-") ? " home-week-task--progress" : ""}`}
          >
            <span aria-hidden="true">{task.completed ? "✓" : "○"}</span>
            <span className="home-week-task-copy">
              <span>{task.title}</span>
              {task.id.startsWith("weekly-") && (
                <span
                  className="home-week-task-meter"
                  role="progressbar"
                  aria-label={task.title}
                  aria-valuemin="0"
                  aria-valuemax={task.goal}
                  aria-valuenow={task.progress}
                >
                  <span style={{ width: `${(task.progress / task.goal) * 100}%` }} />
                </span>
              )}
            </span>
            <strong>{task.completed && task.id.startsWith("daily-") ? `+${task.xp} XP` : task.progressLabel}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HomeInsightCard({ insight }) {
  return (
    <section className="home-insight-card" aria-labelledby="home-insight-title">
      <span className="home-progress-kicker">{insight.source}</span>
      <h2 id="home-insight-title">{insight.title}</h2>
      <p>{insight.message}</p>
    </section>
  );
}

function HomePage() {
  const { state: catchState, refresh: refreshCatches } = useCatches();
  const { state: tripState, refresh: refreshTrips } = useTrips();
  const ledger = useProgression();
  const catches = catchState.catches;
  const season = getSeason(new Date());
  const seasonCatches = useMemo(() => catches.filter((item) => {
    const caughtAt = Date.parse(item.caughtAt);
    return Number.isFinite(caughtAt) && getSeasonKey(new Date(caughtAt)) === season.key;
  }), [catches, season.key]);
  const seasonSpeciesCount = useMemo(
    () => new Set(seasonCatches.map((item) => item.speciesKey || item.species).filter(Boolean)).size,
    [seasonCatches],
  );
  const recordCatch = useMemo(() => getBiggestCatch(catches), [catches]);
  const recentCatches = useMemo(
    () => [...catches].sort((left, right) => Date.parse(right.caughtAt) - Date.parse(left.caughtAt)).slice(0, 4),
    [catches],
  );
  const activeTrip = getActiveTrip(tripState.trips);
  const challenges = useMemo(() => {
    const current = buildChallengeOverview(catches, tripState.trips);
    const persist = (task) => ({ ...task, completed: task.completed || ledger.isChallengeCompleted(task.id, task.periodKey) });
    return { daily: current.daily.map(persist), weekly: current.weekly.map(persist) };
  }, [catches, tripState.trips, ledger]);
  const seasonalChallenge = useMemo(() => {
    const current = buildSeasonalChallenge(catches);
    return { ...current, completed: current.completed || ledger.isChallengeCompleted(current.id, current.id.slice("season-".length)) };
  }, [catches, ledger]);
  const weeklyStreak = ledger.summary.streak;
  const insight = useMemo(() => buildHomeInsight(catches), [catches]);
  const tripsById = useMemo(() => new Map(tripState.trips.map((trip) => [trip.id, trip.title])), [tripState.trips]);

  return (
    <Layout>
      <div className="home-dashboard">
        <header className="dashboard-header">
          <div>
            <h1>ChytnuCz</h1>
            <p>
              {catchState.loading
                ? `${season.label} ${season.year} · Načítám deník…`
                : `${season.label} ${season.year} · ${seasonCatches.length} ${pluralize(seasonCatches.length, ["úlovek", "úlovky", "úlovků"])} · ${seasonSpeciesCount} ${pluralize(seasonSpeciesCount, ["druh", "druhy", "druhů"])}`}
            </p>
          </div>
          <div className="dashboard-header-actions">
            <Link className="dashboard-icon-button" to="/journal#catch-search" aria-label="Hledat v deníku">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
            </Link>
            <Link className="dashboard-icon-button" to="/profile" aria-label="Otevřít profil">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>
            </Link>
          </div>
        </header>

        <FishActivity />

        {!ledger.loading && !ledger.error && <Link className="home-progress-card home-xp-card" to="/levels" aria-label={`Úroveň ${ledger.summary.level}, ${ledger.summary.xp} XP, hodnost ${ledger.summary.rank.name}. Otevřít postup`}>
          <div className="home-progress-heading"><span className="home-progress-kicker">Tvůj postup</span><span>Úrovně a XP →</span></div>
          <h2>Úroveň {ledger.summary.level} · {ledger.summary.rank.name}</h2>
          <p>{ledger.summary.xp} XP{ledger.summary.nextThreshold ? ` · další úroveň při ${ledger.summary.nextThreshold} XP` : " · nejvyšší úroveň"}</p>
          <div className="home-progress-meter" role="progressbar" aria-label="Postup do další úrovně" aria-valuemin="0" aria-valuemax="100" aria-valuenow={ledger.summary.progressPercent}>
            <span style={{ width: `${ledger.summary.progressPercent}%` }} />
          </div>
        </Link>}

        {!catchState.loading && !tripState.loading && !ledger.loading && !catchState.error && !tripState.error && !ledger.error && (
          <>
            <SeasonalChallengeCard challenge={seasonalChallenge} />
          <WeeklyProgressCard tasks={[challenges.daily[0], challenges.weekly[0]]} streak={weeklyStreak} />
          </>
        )}

        {activeTrip && <ActiveTripSummary trip={activeTrip} catches={catches} />}
        {!tripState.loading && !tripState.error && !activeTrip && (
          <Link className="home-no-trip" to="/trips/new">
            <span>
              <strong>Žádná aktivní výprava</strong>
              <span>Zahájit novou výpravu</span>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        )}

        {(catchState.error || tripState.error || ledger.error) && (
          <section className="dashboard-error" role="alert">
            <p>{[catchState.error, tripState.error, ledger.error].filter(Boolean).join(" ")}</p>
            {catchState.error && <button type="button" onClick={refreshCatches}>Načíst úlovky znovu</button>}
            {tripState.error && <button type="button" onClick={refreshTrips}>Načíst výpravy znovu</button>}
          </section>
        )}

        <section className="dashboard-recent" aria-labelledby="dashboard-recent-title">
          <div className="dashboard-section-heading">
            <h2 id="dashboard-recent-title">Poslední úlovky</h2>
            <Link to="/journal">Vše <span aria-hidden="true">→</span></Link>
          </div>
          <nav className="dashboard-view-tabs" aria-label="Zobrazení úlovků">
            <Link className="dashboard-view-tab dashboard-view-tab--active" to="/journal" aria-current="true">Seznam</Link>
            <Link className="dashboard-view-tab" to="/journal/map">Mapa</Link>
            <Link className="dashboard-view-tab" to="/journal/calendar">Kalendář</Link>
          </nav>

          {catchState.loading ? (
            <div className="dashboard-loading" role="status" aria-label="Načítám místní deník">
              <span /><span /><span />
            </div>
          ) : catchState.error ? (
            <div className="dashboard-empty" role="alert">
              <strong>Úlovky se nepodařilo načíst</strong>
              <p>Po načtení bude možné zobrazit aktuální záznamy.</p>
              <button type="button" onClick={refreshCatches}>Zkusit znovu</button>
            </div>
          ) : catches.length === 0 ? (
            <div className="dashboard-empty">
              <strong>Zatím tu nic není</strong>
              <p>Zapiš první úlovek. Záznam zůstane uložený v tvém deníku.</p>
              <Link to="/add">Zapsat první úlovek</Link>
            </div>
          ) : recentCatches.map((item) => (
            <CatchCard
              key={item.id}
              catchedFish={{ ...item, tripTitle: tripsById.get(item.tripId) }}
              isPersonalRecord={item.id === recordCatch?.id}
            />
          ))}
        </section>
        {!catchState.loading && !catchState.error && <HomeInsightCard insight={insight} />}
      </div>
    </Layout>
  );
}

export default HomePage;
