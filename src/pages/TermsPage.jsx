import LegalDocumentPage from "./LegalDocumentPage.jsx";
import { TERMS_OF_USE } from "./legalDocuments.js";

export default function TermsPage() {
  return <LegalDocumentPage document={TERMS_OF_USE} />;
}
