import { useOwnModeration } from "../features/community/useOwnModeration.js";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import CommunityEntryComposer from "../features/social/components/CommunityEntryComposer.jsx";
import SocialFeed from "../features/social/components/SocialFeed.jsx";
import FisherDiscovery from "../features/social/components/FisherDiscovery.jsx";
import { FEATURES } from "../product/config/featureFlags.js";
import { isFeatureEnabled } from "../shared/config/featureFlags.js";
import { useAuth } from "../features/auth/context/authContextValue.js";
import { useCatches } from "../features/catches/context/useCatches.js";
import { buildLocalCommunityFeed } from "../features/community/data/communityFeed.js";
import Layout from "../shared/layout/Layout";
import "./CommunityPage.css";

const FEED_TABS = [
  { id: "global", label: "Pro všechny" },
  { id: "friends", label: "Od přátel" },
  { id: "local", label: "Místní náhled" },
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

    </section>
  );
}

function CommunityPage() {
  const auth = useAuth();
  const [feedRefresh, setFeedRefresh] = useState(0);
  const { state: catchState } = useCatches();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => FEATURES.community ? params.get("feed") === "friends" ? "friends" : "global" : "local");
  const moderation = useOwnModeration();
  const localFeed = useMemo(() => buildLocalCommunityFeed(catchState.catches,moderation), [catchState.catches,moderation]);
  const profileName = auth.user?.displayName?.trim() || (auth.user ? "Můj profil" : "Místní profil");

  return (
    <Layout>
      <section className="community-page" aria-labelledby="community-title">
        <header className="community-header">
          <div>
            <h1 id="community-title">Komunita</h1>
            <p>Úlovky sdílené rybáři</p>
          </div>
        </header>
        <nav className="community-links" aria-label="Nástroje komunity">
          {isFeatureEnabled("friends") && <Link className="community-discovery-link" to="/friends">Přátelé a pozvání</Link>}
          <Link className="community-discovery-link" to="/notifications" state={{ from: "/community" }}>Oznámení</Link>
          {isFeatureEnabled("crew") && <Link className="community-discovery-link" to="/crew">Rybářské skupiny</Link>}
          {isFeatureEnabled("nearby") && <Link className="community-discovery-link" to="/nearby">Dobrovolné Okolí</Link>}
        </nav>
        {isFeatureEnabled("userDiscovery") && <FisherDiscovery key={auth.user?.uid ?? "anonymous"} />}

        {FEATURES.community && <CommunityEntryComposer key={auth.user?.uid ?? "anonymous"} onPublished={() => setFeedRefresh(value => value + 1)} />}

        <nav className="community-tabs"  aria-label="Filtr komunitního přehledu">
          {FEED_TABS.filter(item => FEATURES.community || item.id === "local").map((item) => (
            <button
              className="community-tab"
              type="button"
              aria-pressed={tab === item.id}
              onClick={() => setTab(item.id)}
              key={item.id}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {FEATURES.community && (tab === "friends" || tab === "global") && <SocialFeed key={`${tab}:${feedRefresh}`} mode={tab} />}

        {tab === "local" && (
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

      </section>
    </Layout>
  );
}

export default CommunityPage;
