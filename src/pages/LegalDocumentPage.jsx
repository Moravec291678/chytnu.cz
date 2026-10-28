import { Link } from "react-router-dom";
import "./LegalDocumentPage.css";

function Paragraphs({ paragraphs = [] }) {
  return paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>);
}

function Items({ items = [] }) {
  return items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : null;
}

export default function LegalDocumentPage({ document }) {
  return <main className="legal-page">
    <header className="legal-page-header">
      <Link className="legal-back-link" to="/login">← Zpět do aplikace</Link>
      <p className="legal-eyebrow">ChytnuCz</p>
      <h1>{document.title}</h1>
      <p className="legal-updated">Poslední aktualizace: {document.lastUpdated}</p>
    </header>
    <article className="legal-document">
      {document.sections.map((section) => <section key={section.heading}>
        <h2>{section.heading}</h2>
        <Paragraphs paragraphs={section.paragraphs} />
        <Items items={section.items} />
        {section.note && <p className="legal-note">{section.note}</p>}
        {section.subsections?.map((subsection) => <div className="legal-subsection" key={subsection.heading}>
          <h3>{subsection.heading}</h3>
          <Paragraphs paragraphs={subsection.paragraphs} />
          <Items items={subsection.items} />
          {subsection.note && <p className="legal-note">{subsection.note}</p>}
        </div>)}
      </section>)}
    </article>
    <nav className="legal-related" aria-label="Další právní informace">
      {document.title === "Zásady ochrany osobních údajů"
        ? <Link to="/terms">Podmínky používání →</Link>
        : <Link to="/privacy-policy">Zásady ochrany osobních údajů →</Link>}
    </nav>
  </main>;
}
