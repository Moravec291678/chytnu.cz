import { useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { useProgression } from "../features/progression/context/progressionContextValue.js";
import { canUseStreakFreeze, getPragueStreakMonthKey, getStreakWeekHistory } from "../features/progression/data/streakModel.js";
import "./ProgressionPages.css";
import "./StreakPage.css";

export default function StreakPage() {
  const { state } = useCatches();
  const catches = state.catches ?? [];
  const ledger = useProgression();
  const streak = ledger.summary.streak;
  const nextBonusProgress = streak.weeks % 7;
  const milestones = [4, 12, 52];
  const nextMilestone = milestones.find((weeks) => weeks > streak.weeks) ?? null;
  const [freezePending, setFreezePending] = useState(false);
  const [freezeError, setFreezeError] = useState("");
  const [freezeMessage, setFreezeMessage] = useState("");
  const now = new Date();
  const monthKey = getPragueStreakMonthKey(now);
  const freezeEvents = ledger.events.filter((event) => event.type === "streak.freeze.used");
  const freezeUsedThisMonth = ledger.events.some((event) => event.type === "streak.freeze.used" && event.reasonKey === `streak.freeze.used:${monthKey}`);
  const canFreeze = canUseStreakFreeze(catches, ledger.events, now);
  const weekHistory = getStreakWeekHistory(catches, freezeEvents, now);
  const badgeProgress = Math.min(streak.weeks, 52);
  const applyFreeze = async () => {
    if (freezePending || !canFreeze) return;
    setFreezePending(true);
    setFreezeError("");
    setFreezeMessage("");
    try {
      const result = await ledger.useStreakFreeze();
      setFreezeMessage(result.isNew ? "Série je pro tento týden zmrazená." : "Zmrazení už bylo tento měsíc použito.");
    } catch (error) {
      setFreezeError(error?.message || "Zmrazení série se nepodařilo použít.");
    } finally {
      setFreezePending(false);
    }
  };

  return (
    <Layout>
      <main className="progression-page streak-page">
        <header>
          <Link className="progression-back" to="/profile">← Profil</Link>
          <h1>Série</h1>
          <p>Alespoň 1 záznam za 7 dní.</p>
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
              <div className="streak-week-track" role="list" aria-label="Historie posledních sedmi týdnů">
                {weekHistory.map(({ weekKey, status }) => (
                  <span
                    className={`streak-week streak-week--${status}`}
                    key={weekKey}
                    role="listitem"
                    title={`${weekKey}: ${status === "catch" ? "záznam" : status === "freeze" ? "zmrazení" : "bez záznamu"}`}
                    aria-label={`${weekKey}: ${status === "catch" ? "záznam" : status === "freeze" ? "zmrazení" : "bez záznamu"}`}
                  />
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
                  <p>{freezeUsedThisMonth ? "Tento měsíc už použito" : canFreeze ? "1 zbývá tento měsíc" : "Jen pokud je série aktivní a tento týden bez záznamu"}</p>
                </div>
                <button type="button" onClick={applyFreeze} disabled={freezePending || !canFreeze}>{freezePending ? "Ukládám…" : "Použít"}</button>
              </article>
              <article>
                <div>
                  <h2>Bonus série</h2>
                  <p>+50 XP každých 7 kvalifikovaných týdnů</p>
                </div>
                <span>{nextBonusProgress} / 7</span>
              </article>
              <article>
                <div>
                  <h2>{nextMilestone ? "Odznak za 52 týdnů" : "Odznak za 52 týdnů splněn"}</h2>
                  <p>{badgeProgress} / 52 týdnů</p>
                </div>
                <div className="streak-badge-progress" role="progressbar" aria-label="Postup k odznaku za 52 týdnů" aria-valuemin="0" aria-valuemax="52" aria-valuenow={badgeProgress}>
                  <span style={{ width: `${(badgeProgress / 52) * 100}%` }} />
                </div>
              </article>
            </section>

            {freezeError && <p className="streak-action-error" role="alert">{freezeError}</p>}
            {freezeMessage && <p className="streak-action-message" role="status">{freezeMessage}</p>}
            <p className="progression-muted">Aktivní Supporter nárok zde není ověřen; dostupný je proto pouze 1 freeze měsíčně.</p>

            <section className="streak-milestones" aria-label="Milníky série">
              {milestones.map((weeks) => (
                <div className={ledger.events.some((event) => event.reasonKey === `streak.milestone:${weeks}`) ? "streak-milestone streak-milestone--complete" : "streak-milestone"} key={weeks}>
                  <span>{ledger.events.some((event) => event.reasonKey === `streak.milestone:${weeks}`) ? "✓" : weeks}</span>
                </div>
              ))}
            </section>

            <p className="progression-muted">Týden se počítá podle pražského kalendáře. Zmrazení se uloží do historie profilu.</p>
          </>
        )}
      </main>
    </Layout>
  );
}
