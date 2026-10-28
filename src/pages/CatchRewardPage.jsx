import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { useProgression } from "../features/progression/context/progressionContextValue.js";
import { claimCatchRewardEventIds, getCatchRewardEventIds } from "../features/progression/data/progressionLedger.js";
import { formatCatchMeasurements } from "../features/catches/data/catchWeight.js";
import { getCatchRarity } from "../features/catches/utils/rarity.js";
import { DEFAULT_SPECIES } from "../shared/constants/speciesCatalog.js";
import { getCatchRecordStatus } from "../features/progression/data/catchReward.js";
import "./ProgressionPages.css";

const BREAKDOWN_LABELS = {
  catchXp: "Záznam úlovku",
  seasonalXp: "Sezónní výzva",
  speciesXp: "Nový druh",
  locationXp: "Nová voda",
  dailyQuestXp: "Denní výzvy",
  weeklyQuestXp: "Týdenní výzvy",
  masteryXp: "Druhové mastery",
  streakXp: "Týdenní série",
  achievementXp: "Achievementy",
};

function formatXp(value) {
  return Number(value || 0).toLocaleString("cs-CZ");
}

function getCatchXpLabel(record, xp) {
  if (xp >= 20 && record.coordinates && record.conditions) return "Záznam s GPS a počasím";
  if (xp >= 15 && record.photos?.length) return "Záznam s fotografií";
  return BREAKDOWN_LABELS.catchXp;
}

export default function CatchRewardPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useCatches();
  const progression = useProgression();
  const [claimedEventIds, setClaimedEventIds] = useState([]);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const rewardClaimKey = useRef(null);
  const record = state.catches.find((item) => item.id === id);
  useEffect(() => {
    if (progression.loading) return;
    const claimKey = `${id}:${location.key}`;
    if (rewardClaimKey.current === claimKey) return;
    rewardClaimKey.current = claimKey;
    void Promise.resolve().then(() => {
      const routeEventIds = location.state?.rewardEventIds;
      const eventIds = Array.isArray(routeEventIds) && routeEventIds.length > 0
        ? routeEventIds
        : getCatchRewardEventIds(progression.events, id);
      setClaimedEventIds(claimCatchRewardEventIds(id, eventIds));
      setRewardClaimed(true);
    });
  }, [id, location.key, location.state, progression.events, progression.loading]);
  const reward = record ? progression.rewardForCatch(record.id, claimedEventIds) : null;

  if (state.loading || progression.loading || !rewardClaimed) return <Layout><div className="progression-page"><p className="loading-state" role="status">Načítám odměnu…</p></div></Layout>;
  if (state.error || progression.error) return <Layout><div className="progression-page"><p className="progression-item" role="alert">{state.error || progression.error}</p></div></Layout>;
  if (!record) return <Layout><div className="progression-page"><h1>Úlovek nenalezen</h1><Link to="/journal">Zpět do deníku</Link></div></Layout>;

  const rewardRows = Object.entries(reward?.breakdown ?? {})
    .filter(([, xp]) => xp > 0)
    .map(([key, xp]) => ({
      key,
      xp,
      label: key === "catchXp" ? getCatchXpLabel(record, xp) : BREAKDOWN_LABELS[key] ?? key,
    }));
  const levelProgress = reward?.progressionAfter;
  const xpWithinLevel = levelProgress
    ? Math.max(0, levelProgress.xp - levelProgress.currentThreshold)
    : 0;
  const levelXpRequired = levelProgress?.nextThreshold
    ? levelProgress.nextThreshold - levelProgress.currentThreshold
    : 0;
  const highlights = [
    reward?.newSpecies ? "Nový druh" : null,
    ...Object.entries(getCatchRecordStatus(record, state.catches))
      .filter(([, achieved]) => achieved)
      .map(([key]) => key === "personalRecord" ? "Osobní rekord" : "Rekord druhu"),
  ].filter(Boolean);
  const rarity = getCatchRarity(record, DEFAULT_SPECIES);

  return <Layout>
    <div className="catch-reward-screen">
      <button
        className="catch-reward-close"
        type="button"
        aria-label="Zavřít odměnu"
        onClick={() => navigate(`/catch/${record.id}`)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
      <div className="catch-reward-content">
        <header className="catch-reward-hero">
          <span className={`catch-reward-rarity catch-reward-rarity--${rarity.color}`}>{rarity.label}</span>
          <h1>{record.species}</h1>
          {formatCatchMeasurements(record)
            ? <strong className="catch-reward-weight">{formatCatchMeasurements(record)}</strong>
            : <strong className="catch-reward-weight catch-reward-weight--empty">Záznam úlovku</strong>}
          <p className="catch-reward-record-info">
            {[
              ...highlights,
            ].filter(Boolean).join(" · ") || "Úlovek přidaný do tvého deníku"}
          </p>
        </header>

        {reward ? <>
          <section className="catch-reward-panel" aria-labelledby="catch-reward-earned-title">
            <h2 id="catch-reward-earned-title">Získáno</h2>
            {rewardRows.length > 0 ? (
              <ul className="catch-reward-list">
                {rewardRows.map(({ key, label, xp }) => (
                  <li key={key}>
                    <span className="catch-reward-check" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="m5 12 4.5 4.5L19 7" /></svg>
                    </span>
                    <span className="catch-reward-label">{label}</span>
                    <strong>+{formatXp(xp)} XP</strong>
                  </li>
                ))}
              </ul>
            ) : <p className="catch-reward-empty">Za tento záznam nebyly přidány nové body postupu.</p>}
            <div className="catch-reward-total"><strong>Celkem</strong><strong>+{formatXp(reward.xp)} XP</strong></div>
          </section>

          <section className="catch-reward-level" aria-label="Postup na další úroveň">
            <div>
              <strong>{reward.levelUp ? "Nový level" : "Level"} {reward.levelAfter}</strong>
              {levelProgress?.nextThreshold
                ? <span>{formatXp(xpWithinLevel)} / {formatXp(levelXpRequired)} XP</span>
                : <span>Maximální level</span>}
            </div>
            {levelProgress?.nextThreshold && (
              <div
                className="progression-progress"
                role="progressbar"
                aria-label="Postup do další úrovně"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={levelProgress.progressPercent}
              >
                <span style={{ width: `${levelProgress.progressPercent}%` }} />
              </div>
            )}
          </section>

          {reward.newlyUnlocked.length > 0 && (
            <section className="catch-reward-unlocked" aria-labelledby="catch-reward-unlocked-title">
              <h2 id="catch-reward-unlocked-title">Nově odemčeno</h2>
              {reward.newlyUnlocked.map((item) => (
                <div className="catch-reward-unlock" key={item.id}>
                  <strong>{item.name}</strong>
                  <span>{item.description} · +{formatXp(item.xp)} XP</span>
                </div>
              ))}
            </section>
          )}
        </> : (
          <p className="catch-reward-unavailable" role="status">
            Okamžitý rozpis odměny není dostupný. Uložený úlovek se nezměnil.
          </p>
        )}
      </div>
      {record.verification?.status === "unverified" && (
        <p className="catch-reward-unavailable" role="status">
          Neověřený úlovek · 0 XP. Fotografie a údaje můžeš doplnit později; datum a polohu lze načíst z EXIF podporované fotografie.
          <Link to={`/catch/${record.id}/edit`}> Doplnit úlovek</Link>
        </p>
      )}
      <footer className="catch-reward-actions">
        {reward && <Link className="catch-reward-share" to={`/catch/${record.id}/share`}>Sdílet kartu</Link>}
        <Link className="catch-reward-done" to={`/catch/${record.id}`}>Hotovo</Link>
      </footer>
    </div>
  </Layout>;
}
