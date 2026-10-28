import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { useCatches } from "../features/catches/context/useCatches";
import {
  buildSeasonStoryWithWaters,
  createSeasonStoryShareData,
  formatSeasonStoryShareText,
} from "../features/retrospectives/data/retrospectives.js";
import { useTrips } from "../features/trips/context/useTrips";
import { waterRepository } from "../features/waters/data/waterRepository.js";
import Layout from "../shared/layout/Layout";
import "./SeasonStoryPage.css";

function plural(count, one, few, many) {
  return count === 1 ? one : count >= 2 && count <= 4 ? few : many;
}

function collectYears(catches, trips) {
  const values = [
    ...catches.map((record) => record.caughtAt),
    ...trips.map((trip) => trip.startedAt || trip.createdAt),
  ];
  return [...new Set(values.map(Date.parse).filter(Number.isFinite).map((time) => new Date(time).getFullYear()))];
}

function downloadText(text, year) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `chytnucz-pribeh-sezony-${year}.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SeasonStoryPage() {
  const scope = useDataScope();
  const { state: catchState } = useCatches();
  const { state: tripState } = useTrips();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [waters, setWaters] = useState([]);
  const [waterError, setWaterError] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [shareError, setShareError] = useState("");

  useEffect(() => {
    let active = true;
    if (scope.status !== "ready") return () => { active = false; };
    waterRepository.list(scope).then((records) => {
      if (active) setWaters(records);
    }).catch(() => {
      if (active) setWaterError("Uložené revíry se nepodařilo načíst. Ostatní části příběhu zůstávají dostupné.");
    });
    return () => { active = false; };
  }, [scope]);

  const years = useMemo(() => [...new Set([
    new Date().getFullYear(),
    ...collectYears(catchState.catches, tripState.trips),
  ])].sort((left, right) => right - left), [catchState.catches, tripState.trips]);
  const story = useMemo(
    () => buildSeasonStoryWithWaters(catchState.catches, tripState.trips, waters, year),
    [catchState.catches, tripState.trips, waters, year],
  );
  const loading = catchState.loading || tripState.loading || scope.status === "loading";

  const share = async () => {
    setShareStatus("");
    setShareError("");
    try {
      const data = createSeasonStoryShareData(story);
      const text = formatSeasonStoryShareText(data);
      if (navigator.share) {
        await navigator.share({ title: `Příběh sezóny ${year}`, text });
        setShareStatus("Příběh byl předán systémovému sdílení bez polohy a soukromých údajů.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setShareStatus("Bezpečný text příběhu byl zkopírován.");
      } else {
        downloadText(text, year);
        setShareStatus("Bezpečný text příběhu byl stažen.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") setShareError(error?.message || "Příběh se nepodařilo sdílet.");
    }
  };

  const moment = story.bestMoment?.record;
  const momentMetrics = [
    Number.isFinite(moment?.lengthCm) ? `${moment.lengthCm.toLocaleString("cs-CZ")} cm` : null,
    story.bestMoment?.kind === "weight-pb" && Number.isFinite(moment?.weightKg) ? `${moment.weightKg.toLocaleString("cs-CZ")} kg` : null,
  ].filter(Boolean);

  return (
    <Layout>
      <section className="season-story-page" aria-labelledby="season-story-title">
        <header className="season-story-header">
          <Link to="/profile">← Profil</Link>
          <span>PŘÍBĚH SEZÓNY</span>
          <h1 id="season-story-title">Příběh sezóny</h1>
          <label>Rok
            <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {years.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>
        </header>

        {loading ? <p className="loading-state" role="status">Načítám skutečná data sezóny…</p> : (
          <>
            <section className="season-story-intro">
              <span>{year}</span>
              <h2>{story.catches ? "Sezóna zapsaná v deníku" : "Tento rok čeká na první úlovek"}</h2>
              <p>{story.narrative}</p>
            </section>

            <section className="season-story-stats" aria-label={`Statistiky sezóny ${year}`}>
              <article><span>Vycházky</span><strong>{story.trips}</strong><small>{plural(story.trips, "vycházka", "vycházky", "vycházek")}</small></article>
              {story.distanceKm !== null && <article><span>Vzdálenost</span><strong>{story.distanceKm.toLocaleString("cs-CZ")}</strong><small>km · z {story.distanceTripCount} {plural(story.distanceTripCount, "vycházky", "vycházek", "vycházek")}</small></article>}
              <article><span>Úlovky</span><strong>{story.catches}</strong><small>{plural(story.catches, "úlovek", "úlovky", "úlovků")}</small></article>
              <article><span>Druhy</span><strong>{story.speciesCount}</strong><small>{plural(story.speciesCount, "druh", "druhy", "druhů")}</small></article>
            </section>

            {story.catches === 0 ? (
              <section className="season-story-empty">
                <strong>Žádné hodnoty nejsou doplněné odhadem</strong>
                <p>Po prvním zapsaném úlovku se automaticky vytvoří nejlepší moment, měsíc a nástraha pouze z dat tohoto roku.</p>
              </section>
            ) : (
              <>
                {story.bestMoment && <section className="season-story-highlight">
                  <span>Nejlepší moment</span>
                  <h2>{story.bestMoment.label}</h2>
                  <strong>{moment?.species || "Zapsaný úlovek"}</strong>
                  {momentMetrics.length > 0 && <p>{momentMetrics.join(" · ")}</p>}
                  {moment?.id && <Link to={`/catch/${moment.id}`}>Otevřít úlovek →</Link>}
                </section>}

                <section className="season-story-details" aria-label="Detaily sezóny">
                  <article>
                    <span>Oblíbený revír</span>
                    {story.favoriteWater ? <><strong>{story.favoriteWater.name}</strong><p>{story.favoriteWater.catchCount} {plural(story.favoriteWater.catchCount, "úlovek", "úlovky", "úlovků")}{story.favoriteWater.tripCount ? ` · ${story.favoriteWater.tripCount} vycházek` : ""}</p><Link to={`/waters/${story.favoriteWater.id}`}>Detail revíru →</Link></> : <p>Žádný úlovek není propojený s uloženým revírem.</p>}
                  </article>
                  <article>
                    <span>Nejlepší nástraha</span>
                    {story.bestBait ? <><strong>{story.bestBait.label}</strong><p>{story.bestBait.count}× u {plural(story.bestBait.count, "úlovku", "úlovků", "úlovků")}</p></> : <p>U úlovků není zapsaná nástraha.</p>}
                  </article>
                  <article>
                    <span>Nejlepší měsíc</span>
                    {story.bestMonth ? <><strong>{story.bestMonth.label}</strong><p>{story.bestMonth.count} {plural(story.bestMonth.count, "úlovek", "úlovky", "úlovků")}</p></> : <p>Bez dat.</p>}
                  </article>
                </section>
              </>
            )}

            <button className="season-story-share" type="button" disabled={story.catches === 0 && story.trips === 0} onClick={share}>Sdílet bezpečný souhrn</button>
            <p className="season-story-share-note">Sdílený text neobsahuje revír, polohu, poznámky ani interní údaje.</p>
            {shareStatus && <p className="season-story-feedback" role="status">{shareStatus}</p>}
            {shareError && <p className="season-story-error" role="alert">{shareError}</p>}
          </>
        )}

        {(catchState.error || tripState.error) && <p className="season-story-error" role="alert">{catchState.error || tripState.error}</p>}
        {waterError && <p className="season-story-error" role="alert">{waterError}</p>}
      </section>
    </Layout>
  );
}
