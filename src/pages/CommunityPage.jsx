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
      <span>BACKEND_REQUIRED</span>
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
            <p>Soukromí má přednost před komunitním feedem</p>
          </div>
          <button className="community-search" type="button" disabled aria-label="Hledání vyžaduje komunitní backend">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
          </button>
        </header>

        <nav className="community-tabs" role="tablist" aria-label="Filtr komunitního feedu">
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
            Bez důvěryhodného seznamu přátel, přihlášení a moderovaného backendu nezobrazujeme žádné uživatele ani počty aktivity.
          </CommunityUnavailable>
        )}

        {tab === "nearby" && (
          <>
            <aside className="community-nearby">
              <span className="community-nearby-dot" aria-hidden="true" />
              <div>
                <strong>Okolí je vypnuté</strong>
                <p>Žádné počty rybářů ani cizí polohy se bez anonymizačního backendu nepočítají.</p>
              </div>
            </aside>
            <CommunityUnavailable title="Nearby feed vyžaduje bezpečnou agregaci">
              Přesná GPS se nikdy nezobrazuje. Nearby bude možné zapnout až s ochranou minimálního počtu uživatelů a moderací obsahu.
            </CommunityUnavailable>
          </>
        )}

        {tab === "global" && (
          <section className="community-local-feed" aria-labelledby="community-local-title">
            <header>
              <div><span>DEV · LOCAL PREVIEW</span><h2 id="community-local-title">Moje veřejné náhledy</h2></div>
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
                      <footer><span>Reakce nejsou aktivní</span><em>BACKEND_REQUIRED</em></footer>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <aside className="community-backend-state" aria-label="Stav komunitního backendu">
          <span>BACKEND_REQUIRED</span>
          <strong>Multi-user feed není připojený</strong>
          <p>Přátelé, globální příspěvky, Nearby, reakce a moderace potřebují důvěryhodný vzdálený backend.</p>
        </aside>
      </section>
    </Layout>
  );
}

export default CommunityPage;
