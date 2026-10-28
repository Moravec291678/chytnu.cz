import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { useCatches } from "../features/catches/context/useCatches";
import { photoFrameStyle } from "../features/catches/data/photoFraming.js";
import { buildGalleryItems, countActiveGalleryFilters, filterAndSortGallery, getGalleryOptions } from "../features/catches/data/catchGallery.js";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { useModalFocusTrap } from "../shared/hooks/useModalFocusTrap.js";
import GalleryPhotoImage from "./GalleryPhotoImage.js";
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
    <button type="button" className="gallery-tile-open" onClick={onOpen} aria-label={`Otevřít fotografii: ${item.species}${item.locationName ? `, ${item.locationName}` : ""}`} />
  </div>;
}

function PhotoViewer({ items, index, scope, onClose, onMove }) {
  const item = items[index];
  const location = item.locationName || (item.waterId ? "Revír" : "");
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const touchX = useRef(null);
  useModalFocusTrap(dialogRef, { initialFocusRef: closeRef, onEscape: onClose });
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "ArrowRight") onMove(1);
      if (event.key === "ArrowLeft") onMove(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onMove]);
  return <div className="gallery-viewer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} tabIndex="-1" className="gallery-viewer" role="dialog" aria-modal="true" aria-label="Náhled fotografie" onTouchStart={(event) => { touchX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => {
      if (touchX.current === null) return;
      const delta = event.changedTouches[0]?.clientX - touchX.current;
      if (Math.abs(delta) > 45) onMove(delta < 0 ? 1 : -1);
      touchX.current = null;
    }}>
      <header className="gallery-viewer-header"><div><strong>{item.species}</strong><span>{item.caughtAt ? new Date(item.caughtAt).toLocaleDateString("cs-CZ") : "Datum neuvedeno"}{location ? ` · ${location}` : ""}</span></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Zavřít fotografii">Zavřít</button></header>
      <div className="gallery-viewer-photo">
        <GalleryPhotoImage item={item} scope={scope} style={photoFrameStyle(item)} alt={`Fotografie úlovku – ${item.species}`} />
        <button type="button" className="gallery-viewer-arrow prev" onClick={() => onMove(-1)} aria-label="Předchozí fotografie" disabled={items.length < 2}>‹</button>
        <button type="button" className="gallery-viewer-arrow next" onClick={() => onMove(1)} aria-label="Další fotografie" disabled={items.length < 2}>›</button>
      </div>
      <footer className="gallery-viewer-footer"><span>{index + 1} / {items.length}{item.isPrimary ? " · Hlavní" : ""}</span><Link to={`/catch/${item.catchId}`} onClick={onClose}>Otevřít úlovek <span aria-hidden="true">→</span></Link></footer>
    </section>
  </div>;
}

const INITIAL_FILTERS = { search: "", speciesKey: "", waterKey: "", period: "all", dateFrom: "", dateTo: "", favoriteOnly: false, sort: "newest" };
const EMPTY_FILTERS = { speciesKey: "", waterKey: "", period: "all", dateFrom: "", dateTo: "", favoriteOnly: false };

function GalleryPage() {
  const { state } = useCatches();
  const scope = useDataScope();
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [filterDraft, setFilterDraft] = useState(EMPTY_FILTERS);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(-1);
  const filterDialogRef = useRef(null);
  const filterCloseRef = useRef(null);
  useModalFocusTrap(filterDialogRef, { active: filterPanelOpen, initialFocusRef: filterCloseRef, onEscape: () => setFilterPanelOpen(false) });
  const allItems = useMemo(() => buildGalleryItems(state.catches, { ownerId: scope.ownerId }), [scope.ownerId, state.catches]);
  const options = useMemo(() => getGalleryOptions(allItems), [allItems]);
  const photos = useMemo(() => filterAndSortGallery(allItems, filters), [allItems, filters]);
  const moveViewer = useCallback((direction) => setViewerIndex((current) => current < 0 || !photos.length ? -1 : (current + direction + photos.length) % photos.length), [photos.length]);
  const closeViewer = useCallback(() => setViewerIndex(-1), []);
  const clearFilters = () => setFilters((current) => ({ ...current, ...EMPTY_FILTERS }));
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
    {state.loading ? <p className="gallery-state" role="status">Načítám fotografie…</p> : state.error ? <p className="gallery-state" role="alert">{state.error}</p> : !allItems.length ? <section className="gallery-state"><p>Zatím tu nejsou žádné fotografie.</p><Link to="/add">Přidat úlovek</Link></section> : !photos.length ? <section className="gallery-state"><p>Nenalezeny žádné fotografie pro zvolené filtry.</p><button type="button" className="gallery-reset" onClick={clearFilters}>Vymazat filtry</button></section> : <div className="gallery-grid">{photos.map((item, index) => <GalleryTile key={`${item.catchId}:${item.photoId}`} item={item} scope={scope} onOpen={() => setViewerIndex(index)} />)}</div>}
    {viewerIndex >= 0 && photos[viewerIndex] && <PhotoViewer items={photos} index={viewerIndex} scope={scope} onClose={closeViewer} onMove={moveViewer} />}
  </div></Layout>;
}

export default GalleryPage;
