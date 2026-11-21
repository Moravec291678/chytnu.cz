import { useEffect, useMemo, useRef, useState } from "react";
import CatchMeasurements from "../features/catches/components/CatchMeasurements.jsx";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { photoFrameStyle } from "../features/catches/data/photoFraming.js";
import { buildGalleryItems, countActiveGalleryFilters, filterAndSortGallery, getGalleryOptions, resetGalleryFilters } from "../features/catches/data/catchGallery.js";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { useModalFocusTrap } from "../shared/hooks/useModalFocusTrap.js";
import GalleryPhotoImage from "../features/catches/components/GalleryPhotoImage.js";
import { focusPhotoOpener } from "../shared/components/photoViewerNavigation.js";
import PhotoViewer from "../shared/components/PhotoViewer.jsx";
import CatchPublication from "../features/social/components/CatchPublication.jsx";
import { FEATURES } from "../product/config/featureFlags.js";
import "./GalleryPage.css";
import "../features/catches/components/PhotoSyncStatus.css";

function GalleryTile({ item, scope, onOpen }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (!ref.current || visible || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "180px" });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);
  return <div ref={ref} className="gallery-tile">
    <span className="gallery-tile-image">
      {visible ? <GalleryPhotoImage item={item} scope={scope} style={photoFrameStyle(item)} alt={`${item.species}${item.locationName ? `, ${item.locationName}` : ""}`} loading="lazy" tile /> : <span className="gallery-missing" aria-hidden="true" />}
      {item.isPrimary && <span className="gallery-primary-badge">Hlavní</span>}
    </span>
    {(Number.isFinite(item.lengthCm) || Number.isFinite(item.weightKg)) && <span className="gallery-tile-caption"><CatchMeasurements record={item} size="compact" /></span>}
    <button type="button" className="gallery-tile-open" onClick={onOpen} aria-label={`Otevřít fotografii: ${item.species}${item.locationName ? `, ${item.locationName}` : ""}`} />
  </div>;
}

function GalleryViewer({ items, index, scope, onClose, onSelect, catches }) {
  const [sharingOpen, setSharingOpen] = useState(false);
  const selected = items[index];
  return <PhotoViewer items={items} index={index} onSelect={onSelect} onClose={onClose}
    describe={item => ({ title: item.species, measurements: <CatchMeasurements record={item} size="compact" />, description: [
      item.caughtAt && new Date(item.caughtAt).toLocaleDateString("cs-CZ"), item.locationName, item.isPrimary && "Hlavní fotografie",
    ].filter(Boolean).join(" · ") })}
    renderImage={item => <GalleryPhotoImage key={item.catchId + ":" + item.photoId} item={item} scope={scope} alt={"Fotografie úlovku – " + item.species} />}
    panel={FEATURES.publicSharing && sharingOpen && <CatchPublication key={selected.catchId + ":" + selected.photoId}
      record={catches.find(record => record.id === selected.catchId) ?? { ...selected, id: selected.catchId }} photoId={selected.photoId} />}
    actions={item => <>
      {FEATURES.publicSharing && <button className="publication-toggle" type="button" aria-expanded={sharingOpen}
        onClick={() => setSharingOpen(value => !value)}>{sharingOpen ? "Zpět na fotografii" : "Sdílet úlovek"}</button>}
      <Link to={"/catch/" + item.catchId} onClick={onClose}>Otevřít úlovek →</Link>
    </>} />;
}

const INITIAL_FILTERS = { search: "", speciesKey: "", waterKey: "", period: "all", dateFrom: "", dateTo: "", favoriteOnly: false, sort: "newest" };
const EMPTY_FILTERS = { speciesKey: "", waterKey: "", period: "all", dateFrom: "", dateTo: "", favoriteOnly: false };

function GalleryPage() {
  const { state } = useCatches();
  const scope = useDataScope();
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [filterDraft, setFilterDraft] = useState(EMPTY_FILTERS);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const filterDialogRef = useRef(null);
  const filterCloseRef = useRef(null);
  useModalFocusTrap(filterDialogRef, { active: filterPanelOpen, initialFocusRef: filterCloseRef, onEscape: () => setFilterPanelOpen(false) });
  const allItems = useMemo(() => buildGalleryItems(state.catches, { ownerId: scope.ownerId }), [scope.ownerId, state.catches]);
  const options = useMemo(() => getGalleryOptions(allItems), [allItems]);
  const photos = useMemo(() => filterAndSortGallery(allItems, filters), [allItems, filters]);
  const viewerIndex = photos.findIndex(item => selectedPhoto?.scopeKey === scope.scopeKey && selectedPhoto.catchId === item.catchId && selectedPhoto.photoId === item.photoId);
  const selectPhoto = item => setSelectedPhoto({ scopeKey: scope.scopeKey, catchId: item.catchId, photoId: item.photoId });
  const clearFilters = () => setFilters(resetGalleryFilters);
  const set = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const setDraft = (key, value) => setFilterDraft((current) => ({ ...current, [key]: value }));
  const activeFilterCount = countActiveGalleryFilters(filters);
  const openFilterPanel = () => {
    setFilterDraft({ speciesKey: filters.speciesKey, waterKey: filters.waterKey, period: filters.period,
      dateFrom: filters.dateFrom, dateTo: filters.dateTo, favoriteOnly: filters.favoriteOnly });
    setFilterPanelOpen(true);
  };
  const clearFilterDraft = () => setFilterDraft(EMPTY_FILTERS);
  const applyFilters = () => {
    setFilters((current) => ({ ...current, ...filterDraft }));
    setFilterPanelOpen(false);
  };
  return <Layout><div className="gallery-page">
    <header className="gallery-heading"><div><h1>Galerie</h1><p>{allItems.length} {allItems.length === 1 ? "fotografie" : "fotografií"} z tvých úlovků</p></div></header>
    <section className="gallery-controls" aria-label="Hledání a filtry fotografií">
      <label className="gallery-search"><span className="sr-only">Hledat druh nebo revír</span><input value={filters.search} onChange={(event) => set("search", event.target.value)} placeholder="Hledat druh nebo revír" type="search" /></label>
      <div className="gallery-control-row">
        <div className="gallery-filter-anchor">
          <button type="button" className="gallery-control-button" aria-expanded={filterPanelOpen} aria-controls="gallery-filter-panel" onClick={filterPanelOpen ? () => setFilterPanelOpen(false) : openFilterPanel}>
            Filtry{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          {filterPanelOpen && <div className="gallery-filter-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setFilterPanelOpen(false); }}>
            <section ref={filterDialogRef} tabIndex="-1" id="gallery-filter-panel" className="gallery-filter-panel" role="dialog" aria-modal="true" aria-label="Filtry galerie">
              <header className="gallery-filter-header"><h2>Filtry</h2><button ref={filterCloseRef} type="button" className="gallery-filter-close" onClick={() => setFilterPanelOpen(false)} aria-label="Zavřít filtry">×</button></header>
              <label>Druh<select value={filterDraft.speciesKey} onChange={(event) => setDraft("speciesKey", event.target.value)}><option value="">Všechny druhy</option>{options.species.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
              <label>Voda / revír<select value={filterDraft.waterKey} onChange={(event) => setDraft("waterKey", event.target.value)}><option value="">Všechny vody</option>{options.waters.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
              <label>Období<select value={filterDraft.period} onChange={(event) => setDraft("period", event.target.value)}><option value="all">Všechna období</option><option value="month">Tento měsíc</option><option value="year">Tento rok</option><option value="custom:range">Vlastní rozsah</option></select></label>
              {filterDraft.period === "custom:range" && <div className="gallery-date-range"><label>Od<input type="date" value={filterDraft.dateFrom} onChange={(event) => setDraft("dateFrom", event.target.value)} /></label><label>Do<input type="date" value={filterDraft.dateTo} onChange={(event) => setDraft("dateTo", event.target.value)} /></label></div>}
              <label className="gallery-favorite-toggle"><input type="checkbox" checked={filterDraft.favoriteOnly} onChange={(event) => setDraft("favoriteOnly", event.target.checked)} /> Pouze oblíbené</label>
              <footer className="gallery-filter-actions"><button type="button" className="gallery-filter-clear" onClick={clearFilterDraft}>Vymazat filtry</button><button type="button" className="gallery-filter-apply" onClick={applyFilters}>Použít</button></footer>
            </section>
          </div>}
        </div>
        <label className="gallery-sort-control"><span className="sr-only">Řazení fotografií</span><select value={filters.sort} onChange={(event) => set("sort", event.target.value)}><option value="newest">Nejnovější</option><option value="oldest">Nejstarší</option><option value="longest">Nejdelší úlovek</option><option value="heaviest">Nejtěžší úlovek</option></select></label>
      </div>
    </section>
    {state.loading ? <p className="gallery-state" role="status">Načítám fotografie…</p> : state.error ? <p className="gallery-state" role="alert">{state.error}</p> : !allItems.length ? <section className="gallery-state"><p>Zatím tu nejsou žádné fotografie.</p><Link to="/add">Přidat úlovek</Link></section> : !photos.length ? <section className="gallery-state"><p>Nenalezeny žádné fotografie pro zvolené filtry.</p><button type="button" className="gallery-reset" onClick={clearFilters}>Vymazat filtry</button></section> : <div className="gallery-grid">{photos.map(item => <GalleryTile key={`${item.catchId}:${item.photoId}`} item={item} scope={scope} onOpen={event => { focusPhotoOpener(event); selectPhoto(item); }} />)}</div>}
    {viewerIndex >= 0 && photos[viewerIndex] && <GalleryViewer items={photos} index={viewerIndex} scope={scope} onClose={() => setSelectedPhoto(null)} onSelect={index => selectPhoto(photos[index])} catches={state.catches} />}
  </div></Layout>;
}

export default GalleryPage;
