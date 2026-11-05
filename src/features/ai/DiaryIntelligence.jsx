import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { buildDiaryInsights } from "./diaryInsights.js";
import DiaryAiExplanation from "./DiaryAiExplanation.jsx";
import { AI_FEATURES } from "./aiPolicy.js";
import { useDataScope } from "../auth/context/dataScopeContextValue.js";

export default function DiaryIntelligence({ catches, trips, waters, analysisEnabled = true, recommendationsEnabled = true }) {
  const scope = useDataScope();
  const [expanded, setExpanded] = useState(false);
  const externalEnabled = AI_FEATURES.diary || AI_FEATURES.recommendations;
  const report = useMemo(() => expanded && (analysisEnabled || recommendationsEnabled || externalEnabled) ? buildDiaryInsights(catches, { trips, waters }) : null,
    [expanded, catches, trips, waters, analysisEnabled, recommendationsEnabled, externalEnabled]);
  if (!analysisEnabled && !recommendationsEnabled && !externalEnabled) return <section className="insights-section">
    <h2>Postřehy z deníku</h2><p>Místní rozbor je vypnutý. <Link to="/settings">Upravit nastavení</Link></p>
  </section>;
  return <section className="insights-section" aria-labelledby="diary-intelligence-title">
    <h2 id="diary-intelligence-title">Analýza deníku a doporučení</h2>
    <div className="insights-section-body">
      <p>Bezplatný místní rozbor z tvých záznamů. Počítá jej aplikace, nikoli AI model. Fotografie, poznámky ani poloha se neposílají externí AI službě.</p>
      <button className="insights-analysis-button" type="button" aria-expanded={expanded} aria-controls="diary-intelligence-report" onClick={() => setExpanded(value => !value)}>{expanded ? "Sbalit rozbor" : "Vyhodnotit deník místně"}</button>
      {report && <div id="diary-intelligence-report">
        <p>{report.summary}</p>
        {analysisEnabled && <>
          <h3>Co je v záznamech</h3>
          <ul className="insights-list">{report.facts.map(item => <li key={item.id}><strong>{item.title}:</strong> {item.text}</li>)}</ul>
          {report.insights.length > 0 && <details><summary>Pozorované souvislosti</summary><ul className="insights-list">{report.insights.map(item => <li key={item.id}><strong>{item.title}:</strong> {item.text}</li>)}</ul></details>}
        </>}
        {recommendationsEnabled && <>
          <h3>Doporučení pro další výpravu</h3>
          <ul className="insights-list">{report.recommendations.map(item => <li key={item.id}><strong>{item.title}:</strong> {item.text}</li>)}</ul>
        </>}
        <DiaryAiExplanation key={scope.scopeKey} report={report} />
        <details><summary>Z čeho rozbor vychází</summary>
          <p>Každý bod vychází z uvedených záznamů nebo z chybějících údajů. Četnost úlovků neříká pravděpodobnost úspěchu.</p>
          <ul className="insights-list">{report.limitations.map(line => <li key={line}>{line}</li>)}</ul>
          <ul className="insights-evidence">{report.evidenceIds.slice(0, 20).map(id => <li key={id}><Link to={`/catch/${encodeURIComponent(id)}`}>Otevřít záznam úlovku</Link></li>)}</ul>
          {report.evidenceIds.length > 20 && <p>Zobrazeno prvních 20 zdrojových záznamů. <Link to="/journal">Otevřít celý deník</Link></p>}
        </details>
      </div>}
    </div>
  </section>;
}
