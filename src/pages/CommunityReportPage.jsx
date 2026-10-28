import { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useModalFocusTrap } from "../shared/hooks/useModalFocusTrap.js";
import Layout from "../shared/layout/Layout";
import "./CommunityReportPage.css";

const REPORT_REASONS = ["Podezřelý úlovek", "Spam", "Nevhodný obsah"];

function CommunityReportPage() {
  const navigate = useNavigate();
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  useModalFocusTrap(dialogRef, { initialFocusRef: closeRef, onEscape: () => navigate("/community") });
  return (
    <Layout>
      <main className="community-report-page">
        <p className="community-report-context">Obsah komunity</p>
        <section ref={dialogRef} tabIndex="-1" className="community-report-sheet" role="dialog" aria-modal="true" aria-labelledby="community-report-title">
          <Link ref={closeRef} className="community-report-close" to="/community" aria-label="Zavřít hlášení">×</Link>
          <h1 id="community-report-title">Nahlásit</h1>
          <p className="community-report-message">
            Příspěvek není dostupný. Hlášení lze odeslat, až bude připraven bezpečný a moderovaný proces.
          </p>
          <div className="community-report-reasons" aria-label="Důvod nahlášení">
            {REPORT_REASONS.map((reason) => (
              <button type="button" disabled key={reason}>{reason}</button>
            ))}
          </div>
        </section>
      </main>
    </Layout>
  );
}

export default CommunityReportPage;
