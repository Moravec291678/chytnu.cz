import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import { EmptyState, ErrorState, LoadingSkeleton, NoResultsState } from "../shared/components/UIStates.jsx";
import { DEFAULT_METHODS } from "../shared/constants/constants";
import CatchCard from "../features/catches/components/CatchCard";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import { filterAndSortCatches, hasActiveJournalFilters } from "../features/catches/utils/catchJournal";
import { normalizeText } from "../shared/utils/helpers";
import "./JournalPage.css";

const EMPTY_FILTERS = { search: "", speciesKey: "", dateFrom: "", dateTo: "", favoriteOnly: false, result: "", methodKey: "", tripId: "", sort: "newest" };
const SORTS = [
  ["newest", "Nejnovější"], ["oldest", "Nejstarší"], ["heaviest", "Nejtěžší"],
  ["lightest", "Nejlehčí"], ["longest", "Nejdelší"], ["shortest", "Nejkratší"],
];

function pluralize(count, forms) {
  const remainder = count % 100;
  if (remainder >= 11 && remainder <= 14) return forms[2];
  const lastDigit = count % 10;
  if (lastDigit === 1) return forms[0];
  if (lastDigit >= 2 && lastDigit <= 4) return forms[1];
  return forms[2];
}

function JournalPage() {
  const { state, refresh } = useCatches();
  const { state: tripState } = useTrips();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const species = useMemo(() => [...new Map(state.catches.map((item) => [item.speciesKey, { key: item.speciesKey, label: item.species }])).values()]
    .sort((a, b) => normalizeText(a.label).localeCompare(normalizeText(b.label), "cs")), [state.catches]);
  const results = useMemo(() => filterAndSortCatches(state.catches, filters, tripState.trips), [state.catches, filters, tripState.trips]);
  const activeFilters = hasActiveJournalFilters(filters);
  const activeFilterCount = [filters.speciesKey, filters.dateFrom, filters.dateTo, filters.favoriteOnly, filters.result, filters.methodKey, filters.tripId]
    .filter(Boolean).length;
  const tripsById = useMemo(() => new Map(tripState.trips.map((trip) => [trip.id, trip.title])), [tripState.trips]);
  const visibleCatches = results.map((item) => ({ ...item, tripTitle: tripsById.get(item.tripId) }));
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const resetFilters = () => setFilters(EMPTY_FILTERS);

  return <Layout><div className="journal-page">
    <header className="home-header">
      <div className="home-header-top">
        <div>
          <h1>Deník</h1>
          <p>{state.catches.length} {pluralize(state.catches.length, ["úlovek", "úlovky", "úlovků"])} · {species.length} {pluralize(species.length, ["druh", "druhy", "druhů"])}</p>
        </div>
      </div>
      <nav className="journal-tabs" aria-label="Zobrazení deníku">
        <span className="journal-tab journal-tab-active" aria-current="page">Seznam</span>
        <Link className="journal-tab" to="/journal/map">Mapa</Link>
        <Link className="journal-tab" to="/journal/calendar">Kalendář</Link>
      </nav>
      <div className="journal-controls">
        <label className="journal-search">
          <span aria-hidden="true" className="journal-search-icon">⌕</span>
          <span className="visually-hidden">Hledat v deníku</span>
          <input id="catch-search" type="search" placeholder="Druh, lokalita, metoda…" value={filters.search} onChange={(event) => setFilter("search", event.target.value)} />
          {filters.search && <button className="journal-search-clear" type="button" aria-label="Vymazat hledání" onClick={() => setFilter("search", "")}>×</button>}
        </label>
        <div className="journal-filter-actions">
          <button className="journal-filter-toggle" type="button" aria-expanded={filtersExpanded} aria-controls="journal-filter-panel" onClick={() => setFiltersExpanded((expanded) => !expanded)}>
            <span className="filter-toggle-label">Filtry</span>
            {activeFilterCount > 0 && <span className="journal-filter-count" aria-label={`${activeFilterCount} aktivní filtry`}>{activeFilterCount}</span>}
            <span aria-hidden="true" className="filter-toggle-arrow">{filtersExpanded ? "⌃" : "⌄"}</span>
          </button>
          {activeFilters && <button className="journal-reset-button" type="button" onClick={resetFilters}>Vymazat</button>}
        </div>
        {filtersExpanded && <div id="journal-filter-panel" className="journal-filter-panel">
        <div className="journal-filter-grid">
          <label>Druh<select className="journal-control" value={filters.speciesKey} onChange={(event) => setFilter("speciesKey", event.target.value)}><option value="">Všechny druhy</option>{species.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
          <label>Řazení<select className="journal-control" value={filters.sort} onChange={(event) => setFilter("sort", event.target.value)}>{SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Od<input className="journal-control" aria-label="Datum od" type="date" value={filters.dateFrom} onChange={(event) => setFilter("dateFrom", event.target.value)} /></label>
          <label>Do<input className="journal-control" aria-label="Datum do" type="date" value={filters.dateTo} onChange={(event) => setFilter("dateTo", event.target.value)} /></label>
          <label>Výsledek<select className="journal-control" value={filters.result} onChange={(event) => setFilter("result", event.target.value)}><option value="">Jakýkoli</option><option value="released">Puštěno</option><option value="kept">Ponecháno</option><option value="unspecified">Neuvedeno</option></select></label>
          <label>Metoda<select className="journal-control" value={filters.methodKey} onChange={(event) => setFilter("methodKey", event.target.value)}><option value="">Všechny metody</option>{DEFAULT_METHODS.map((method) => <option key={method.key} value={method.key}>{method.label}</option>)}</select></label>
          <label>Vycházka<select className="journal-control" value={filters.tripId} onChange={(event) => setFilter("tripId", event.target.value)}><option value="">Všechny vycházky</option>{tripState.trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}</select></label>
        </div>
        <label className="journal-favorite-filter"><input type="checkbox" checked={filters.favoriteOnly} onChange={(event) => setFilter("favoriteOnly", event.target.checked)} /> Jen oblíbené</label>
        </div>}
      </div>
    </header>

    <h2 className="section-title">{activeFilters ? `Výsledky · ${results.length}` : "Všechny úlovky"}</h2>
    {state.loading ? <LoadingSkeleton className="journal-skeleton" label="Načítám místní deník" count={3} />
      : state.error ? <ErrorState className="journal-empty" title="Deník se nepodařilo načíst" message="Zkontroluj místní úložiště a zkus načtení zopakovat." onRetry={refresh} />
        : state.catches.length === 0 ? <EmptyState className="journal-empty" title="Zatím tu nic není" description="Zapiš svůj první úlovek a začni budovat rybářský příběh." action={<Link to="/add">Zapsat první úlovek</Link>} />
          : visibleCatches.length === 0 ? <NoResultsState className="empty-search" title="Žádné výsledky" description="Úlovek neodpovídá zvolenému hledání a filtrům." action={<button type="button" onClick={resetFilters}>Vymazat filtry</button>} />
            : visibleCatches.map((item) => <CatchCard key={item.id} catchedFish={item} />)}
  </div></Layout>;
}

export default JournalPage;
