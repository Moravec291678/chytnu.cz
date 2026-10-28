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
  assert.match(text, /není úplným cloudovým exportem/i);
  assert.match(text, /automatizované úplné smazání cloudového účtu/i);
  assert.match(text, /přibližně po 7 dnech/i);
  assert.match(text, /pevnou lhůtu 24 hodin aplikace negarantuje/i);
  assert.match(text, /David Moravec/);
});

test("terms explain offline use, user content, fishing rules and account deletion limits", () => {
  const text = flatten(TERMS_OF_USE);
  assert.match(text, /částečně fungovat offline/i);
  assert.match(text, /Práva k fotografiím/i);
  assert.match(text, /rybářský řád/i);
  assert.match(text, /Úplné smazání účtu není v aplikaci automatizované/i);
  assert.match(text, /místní JSON zálohu/i);
});
