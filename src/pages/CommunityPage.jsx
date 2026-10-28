import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../features/auth/context/authContextValue.js";
import { useCatches } from "../features/catches/context/useCatches.js";
import { buildLocalCommunityFeed } from "../features/community/data/communityFeed.js";
import Layout from "../shared/layout/Layout";
import "./CommunityPage.css";

const FEED_TABS = [
  { id: "friends", label: "Přátelé" },
  { id: "nearby", label: "Okolí" },
  { id: "global", label: "Všichni" },
];

function formatDate(value) {
  if (!Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long" }).format(new Date(value));
}

function CommunityUnavailable({ title, children }) {
  return (
    <section className="community-empty">
      <div className="community-empty-mark" aria-hidden="true">↗</div>
      <h2>{title}</h2>
      <p>{children}</p>
      <span>ZATÍM NEDOSTUPNÉ</span>
    </section>
  );
}

function CommunityPage() {
  const auth = useAuth();
  const { state: catchState } = useCatches();
  const [tab, setTab] = useState("friends");
  const localFeed = useMemo(() => buildLocalCommunityFeed(catchState.catches), [catchState.catches]);
  const profileName = auth.user?.displayName?.trim() || (auth.user ? "Můj profil" : "Místní profil");

  return (
    <Layout>
      <section className="community-page" aria-labelledby="community-title">
        <header className="community-header">
          <div>
            <h1 id="community-title">Komunita</h1>
            <p>Soukromí má přednost před komunitním přehledem</p>
          </div>
          <button className="community-search" type="button" disabled aria-label="Hledání zatím není dostupné">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
          </button>
        </header>

        <nav className="community-tabs" role="tablist" aria-label="Filtr komunitního přehledu">
          {FEED_TABS.map((item) => (
            <button
              className="community-tab"
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              key={item.id}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {tab === "friends" && (
          <CommunityUnavailable title="Feed přátel zatím není dostupný">
            Přehled členů zatím není dostupný. Nezobrazujeme cizí polohy ani počty aktivity.
          </CommunityUnavailable>
        )}

        {tab === "nearby" && (
          <>
            <aside className="community-nearby">
              <span className="community-nearby-dot" aria-hidden="true" />
              <div>
                <strong>Okolí je vypnuté</strong>
                <p>Počty rybářů ani jejich polohy se nezobrazují.</p>
              </div>
            </aside>
            <CommunityUnavailable title="Přehled okolí zatím není dostupný">
              Přesná poloha se nikdy nezobrazuje. Přehled okolí bude dostupný po zavedení ochrany soukromí a moderace obsahu.
            </CommunityUnavailable>
          </>
        )}

        {tab === "global" && (
          <section className="community-local-feed" aria-labelledby="community-local-title">
            <header>
              <div><span>MÍSTNÍ NÁHLED</span><h2 id="community-local-title">Moje veřejné náhledy</h2></div>
              <p>Nic se neodesílá. Zobrazené údaje vznikají z privacy allowlistu pouze v tomto zařízení.</p>
            </header>
            {catchState.loading ? (
              <p className="loading-state" role="status">Načítám bezpečné náhledy…</p>
            ) : catchState.error ? (
              <p className="community-feed-error" role="alert">{catchState.error}</p>
            ) : localFeed.length === 0 ? (
              <CommunityUnavailable title="Žádný veřejný lokální náhled">
                Soukromé úlovky se zde nezobrazí. Náhled vznikne pouze z úlovku výslovně označeného jako veřejný.
              </CommunityUnavailable>
            ) : (
              <div className="community-feed-list">
                {localFeed.map((item) => {
                  const data = item.projection;
                  return (
                    <article className="community-feed-card" key={item.id}>
                      <Link to={`/community/catch/${item.catchId}`} aria-label={`Otevřít komunitní detail: ${data.species}`}>
                        <div className="community-feed-card-top"><strong>{profileName}</strong><span>Lokální náhled</span></div>
                        <h3>{data.species}</h3>
                        <div className="community-feed-metrics">
                          {data.lengthCm !== null && <b>{data.lengthCm.toLocaleString("cs-CZ")} cm</b>}
                          {data.weightKg !== null && <b>{data.weightSource === "estimated" ? "≈ " : ""}{data.weightKg.toLocaleString("cs-CZ")} kg</b>}
                        </div>
                        {formatDate(data.caughtAt) && <time dateTime={data.caughtAt}>{formatDate(data.caughtAt)}</time>}
                      </Link>
                      <footer><span>Reakce zatím nejsou dostupné</span></footer>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <aside className="community-backend-state" aria-label="Stav komunity">
          <span>ZATÍM NEDOSTUPNÉ</span>
          <strong>Společný přehled zatím není dostupný</strong>
          <p>Příspěvky ostatních rybářů, reakce a moderace zatím nejsou připravené.</p>
        </aside>
      </section>
    </Layout>
  );
}

export default CommunityPage;
