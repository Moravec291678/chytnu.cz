import LegalDocumentPage from "./LegalDocumentPage.jsx";
import { PRIVACY_POLICY } from "./legalDocuments.js";

export default function PrivacyPolicyPage() {
  return <LegalDocumentPage document={PRIVACY_POLICY} />;
}
