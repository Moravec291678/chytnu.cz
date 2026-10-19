import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../shared/layout/Layout";
import CatchCard from "../features/catches/components/CatchCard";
import { useCatches } from "../features/catches/context/useCatches";
import { useTrips } from "../features/trips/context/useTrips";
import { getBiggestCatch } from "../features/home/utils/profileStats";
import {
  buildJournalActivity,
  buildJournalYearMonths,
  getCalendarMonthLayout,
  summarizeJournalMonth,
  toCalendarDateKey,
} from "../features/journal/data/journalCalendar.js";
import "./JournalCalendarPage.css";

const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

function monthLabel(date) {
  return new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric" }).format(date);
}

function countLabel(count, forms) {
  const word = count === 1 ? forms[0] : count >= 2 && count <= 4 ? forms[1] : forms[2];
  return `${count} ${word}`;
}

export default function JournalCalendarPage() {
  const { state: catchState, refresh: refreshCatches } = useCatches();
  const { state: tripState, refresh: refreshTrips } = useTrips();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [calendarView, setCalendarView] = useState("month");
  const [selectedDay, setSelectedDay] = useState(() => toCalendarDateKey(new Date()));
  const { catchesByDay, tripsByDay } = useMemo(
    () => buildJournalActivity(catchState.catches, tripState.trips),
    [catchState.catches, tripState.trips],
  );
  const personalRecord = getBiggestCatch(catchState.catches);
  const { firstOffset, dayCount } = getCalendarMonthLayout(month);
  const monthSummary = summarizeJournalMonth(catchesByDay, tripsByDay, month.getFullYear(), month.getMonth());
  const yearMonths = buildJournalYearMonths(catchesByDay, tripsByDay, month.getFullYear());
  const yearSummary = yearMonths.reduce((summary, item) => ({
    catchCount: summary.catchCount + item.catchCount,
    tripCount: summary.tripCount + item.tripCount,
  }), { catchCount: 0, tripCount: 0 });
  const selectedCatches = catchesByDay.get(selectedDay) ?? [];
  const selectedTrips = tripsByDay.get(selectedDay) ?? [];
  const tripsById = useMemo(() => new Map(tripState.trips.map((item) => [item.id, item.title])), [tripState.trips]);
  const loading = catchState.loading || tripState.loading;
  const error = [catchState.error, tripState.error].filter(Boolean).join(" ");

  const shiftPeriod = (offset) => {
    const next = new Date(month.getFullYear(), month.getMonth() + (calendarView === "year" ? offset * 12 : offset), 1);
    setMonth(next);
    setSelectedDay(toCalendarDateKey(next));
  };
  const selectMonth = (monthIndex) => {
    const selectedMonth = new Date(month.getFullYear(), monthIndex, 1);
    setMonth(selectedMonth);
    setSelectedDay(toCalendarDateKey(selectedMonth));
    setCalendarView("month");
  };

  return <Layout><main className="journal-calendar">
    <header className="journal-calendar-header">
      <h1>Deník</h1>
      <p>{monthLabel(month)} · {countLabel(monthSummary.catchCount, ["úlovek", "úlovky", "úlovků"])} · {countLabel(monthSummary.tripCount, ["výprava", "výpravy", "výprav"])}</p>
    </header>
    <nav className="journal-tabs" aria-label="Zobrazení deníku">
      <Link className="journal-tab" to="/journal">Seznam</Link>
      <Link className="journal-tab" to="/journal/map">Mapa</Link>
      <span className="journal-tab journal-tab-active" aria-current="page">Kalendář</span>
    </nav>
    <nav className="journal-calendar-view-toggle" aria-label="Rozsah kalendáře">
      <button type="button" aria-pressed={calendarView === "month"} onClick={() => setCalendarView("month")}>Měsíc</button>
      <button type="button" aria-pressed={calendarView === "year"} onClick={() => setCalendarView("year")}>Rok</button>
    </nav>
    {error && <section className="journal-calendar-error" role="alert"><p>{error}</p>{catchState.error && <button type="button" onClick={refreshCatches}>Načíst úlovky znovu</button>}{tripState.error && <button type="button" onClick={refreshTrips}>Načíst výpravy znovu</button>}</section>}
    {loading ? <p className="loading-state" role="status">Načítám kalendář…</p> : !error && <>
      {calendarView === "month" ? <section className="journal-calendar-panel" aria-label="Kalendář rybářských aktivit">
        <div className="journal-calendar-month">
          <button type="button" aria-label="Předchozí měsíc" onClick={() => shiftPeriod(-1)}>‹</button>
          <h2>{monthLabel(month)}</h2>
          <button type="button" aria-label="Další měsíc" onClick={() => shiftPeriod(1)}>›</button>
        </div>
        <div className="journal-calendar-grid" role="grid" aria-label={monthLabel(month)}>
          {WEEKDAYS.map((day) => <span className="journal-calendar-weekday" role="columnheader" key={day}>{day}</span>)}
          {Array.from({ length: firstOffset }, (_, index) => <span className="journal-calendar-blank" role="gridcell" aria-hidden="true" key={`blank-${index}`} />)}
          {Array.from({ length: dayCount }, (_, index) => {
            const day = index + 1;
            const current = new Date(month.getFullYear(), month.getMonth(), day);
            const key = toCalendarDateKey(current);
            const dayCatches = catchesByDay.get(key) ?? [];
            const dayTrips = tripsByDay.get(key) ?? [];
            const hasRecord = dayCatches.some((item) => item.id === personalRecord?.id);
            return <button
              className={`journal-calendar-day${selectedDay === key ? " is-selected" : ""}${hasRecord ? " has-record" : ""}`}
              type="button"
              role="gridcell"
              aria-pressed={selectedDay === key}
              aria-label={`${day} ${monthLabel(month)}${dayCatches.length ? `, ${countLabel(dayCatches.length, ["úlovek", "úlovky", "úlovků"])}` : ""}${dayTrips.length ? `, ${countLabel(dayTrips.length, ["výprava", "výpravy", "výprav"])}` : ""}${hasRecord ? ", osobní rekord" : ""}`}
              onClick={() => setSelectedDay(key)}
              key={key}
            >
              <span>{day}</span>
              <span className="journal-calendar-markers" aria-hidden="true">
                {dayCatches.length > 0 && <i className="marker-catch" />}
                {dayTrips.length > 0 && <i className="marker-trip" />}
                {hasRecord && <i className="marker-record" />}
              </span>
            </button>;
          })}
        </div>
        <div className="journal-calendar-legend"><span><i className="marker-catch" /> Úlovek</span><span><i className="marker-trip" /> Výprava</span><span><i className="marker-record" /> Rekord</span></div>
      </section> : <section className="journal-calendar-year" aria-label={`Přehled roku ${month.getFullYear()}`}>
        <div className="journal-calendar-month">
          <button type="button" aria-label="Předchozí rok" onClick={() => shiftPeriod(-1)}>‹</button>
          <h2>{month.getFullYear()} · {countLabel(yearSummary.catchCount, ["úlovek", "úlovky", "úlovků"])} · {countLabel(yearSummary.tripCount, ["výprava", "výpravy", "výprav"])}</h2>
          <button type="button" aria-label="Další rok" onClick={() => shiftPeriod(1)}>›</button>
        </div>
        <div className="journal-calendar-year-grid">
          {yearMonths.map((item) => <button
            type="button"
            className={item.month === month.getMonth() ? "journal-calendar-year-month is-selected" : "journal-calendar-year-month"}
            aria-label={`${new Intl.DateTimeFormat("cs-CZ", { month: "long" }).format(new Date(month.getFullYear(), item.month, 1))}, ${countLabel(item.catchCount, ["úlovek", "úlovky", "úlovků"])}, ${countLabel(item.tripCount, ["výprava", "výpravy", "výprav"])}`}
            key={item.month}
            onClick={() => selectMonth(item.month)}
          >
            <strong>{new Intl.DateTimeFormat("cs-CZ", { month: "short" }).format(new Date(month.getFullYear(), item.month, 1)).replace(".", "")}</strong>
            <span>{item.catchCount} · {item.tripCount}</span>
            <span className="journal-calendar-year-markers" aria-hidden="true">
              {item.catchCount > 0 && <i className="marker-catch" />}
              {item.tripCount > 0 && <i className="marker-trip" />}
            </span>
          </button>)}
        </div>
        <div className="journal-calendar-legend"><span><i className="marker-catch" /> Úlovky</span><span><i className="marker-trip" /> Výpravy</span></div>
      </section>}
      {calendarView === "month" && <section className="journal-calendar-day-details" aria-live="polite">
        <h2>{new Intl.DateTimeFormat("cs-CZ", { dateStyle: "full" }).format(new Date(`${selectedDay}T12:00:00`))}</h2>
        {selectedCatches.length || selectedTrips.length ? <>
          {selectedTrips.map((trip) => <Link className="progression-link" to={`/trips/${trip.id}`} key={trip.id}>Výprava · {trip.title}<span>→</span></Link>)}
          {selectedCatches.map((item) => <CatchCard key={item.id} catchedFish={{ ...item, tripTitle: tripsById.get(item.tripId) }} isPersonalRecord={item.id === personalRecord?.id} />)}
        </> : <div className="journal-calendar-empty"><p>V tento den nejsou v deníku uložené úlovky ani výpravy.</p><Link to="/add">Zapsat úlovek</Link></div>}
      </section>}
    </>}
  </main></Layout>;
}
