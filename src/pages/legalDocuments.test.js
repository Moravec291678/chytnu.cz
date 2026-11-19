import test from "node:test";
import assert from "node:assert/strict";
import { PRIVACY_POLICY, TERMS_OF_USE } from "./legalDocuments.js";

const flatten = (document) => document.sections.flatMap((section) => [
  ...(section.paragraphs ?? []),
  ...(section.items ?? []),
  ...(section.note ? [section.note] : []),
  ...(section.subsections ?? []).flatMap((subsection) => [
    ...(subsection.paragraphs ?? []),
    ...(subsection.items ?? []),
    ...(subsection.note ? [subsection.note] : []),
  ]),
]).join(" ");

test("privacy policy is ready for the public app and describes local-only backup limits", () => {
  const text = flatten(PRIVACY_POLICY);
  assert.match(text, /místní JSON záloh/i);
  assert.match(text, /údajů svého přihlášeného účtu/i);
  assert.match(text, /po opětovném ověření přihlášení/i);
  assert.match(text, /přibližně po 7 dnech/i);
  assert.match(text, /pevnou lhůtu 24 hodin aplikace negarantuje/i);
  assert.match(text, /David Moravec/);
});

test("terms explain offline use, user content, fishing rules and account deletion limits", () => {
  const text = flatten(TERMS_OF_USE);
  assert.match(text, /částečně fungovat offline/i);
  assert.match(text, /Práva k fotografiím/i);
  assert.match(text, /rybářský řád/i);
  assert.match(text, /Smazání účtu můžeš zahájit v Nastavení/i);
  assert.match(text, /místní JSON zálohu/i);
});

test("AI privacy notice names actual processor, data minimization, opt-in, revocation and honest retention limits", () => {
  const text = flatten(PRIVACY_POLICY);
  assert.match(text, /Cloudflare Workers AI/);
  assert.match(text, /samostatného souhlasu/);
  assert.match(text, /ve výchozím nastavení vypnuté/);
  assert.match(text, /při výpadku může odstranění vyžadovat opakování/);
  assert.match(text, /nikoli celý deník/);
  assert.match(text, /Pro příběh odešleme pouze poznámku/);
  assert.match(text, /Jediné externí AI funkce jsou volitelné návrhy rybářských příběhů/);
  assert.match(text, /Fotografie se AI neposílají/);
  assert.match(text, /právní a bezpečnostní výjimky/);
  assert.match(text, /Nejde o záruku absolutní nulové retence/);
  assert.match(text, /Odvoláním souhlasu zastavíš další externí požadavky/);
  assert.match(text, /Souhlas a dostupné uložené výsledky zahrnuje export účtu/);
  assert.match(text, /při smazání účtu se odstraňují/);
  assert.match(text, /Neprovádíme AI rozpoznávání ryb/);
  assert.doesNotMatch(text, /Automatické rozpoznávání nových rychlých úlovků|Pro rozpoznání ryby odešleme|oprávnění uděluješ zvlášť pro rozpoznávání ryb/i);
  assert.doesNotMatch(text, /generování příběhů nejsou aktivované/);
});

test("AI terms require review and preserve ordinary journal without guarantees or invented measurements", () => {
  const text = flatten(TERMS_OF_USE);
  assert.match(text, /dobrovolné/);
  assert.match(text, /není ověřená pravděpodobnost/);
  assert.match(text, /nezaručuje úspěšný lov/);
  assert.match(text, /neodvozuje délku nebo hmotnost/);
  assert.match(text, /bez tvého schválení přepsat poznámky/);
  assert.match(text, /bez externí AI/);
});
