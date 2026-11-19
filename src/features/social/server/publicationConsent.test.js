import { test } from "node:test";
import assert from "node:assert/strict";
import { consentChoice, assertPublicationConsent, consentAllowsPost, automaticCatchEligible } from "./publicationConsent.js";
test("consent is versioned, strict, stable on retries and revocation never revives old posts", () => {
  for (const input of [{version:2,mode:"public"},{version:1,mode:"public",uid:"other"},[],null]) assert.throws(()=>consentChoice(input,null,100),/invalid_consent/);
  const first=consentChoice({version:1,mode:"public"},null,100);
  assert.deepEqual(first,{version:1,mode:"public",epoch:1,acceptedAt:100});
  assert.deepEqual(consentChoice({version:1,mode:"public"},first,200),first);
  const off=consentChoice({version:1,mode:"private",expectedEpoch:1},first,200), again=consentChoice({version:1,mode:"public",expectedEpoch:2},off,300);
  assert.throws(()=>consentChoice({version:1,mode:"public",expectedEpoch:1},off,300),/consent_conflict/);
  assert.throws(()=>consentChoice({version:1,mode:"public"},off,300),/consent_conflict/);
  assert.throws(()=>consentChoice(undefined,again,400),/consent_conflict/);
  assert.throws(()=>consentChoice({version:1,mode:"public"},again,400),/consent_conflict/);
  assert.equal(consentAllowsPost(first,{publicationEpoch:1}),true);
  assert.equal(consentAllowsPost(off,{publicationEpoch:1}),false);
  assert.equal(consentAllowsPost(again,{publicationEpoch:1}),false);
  assert.equal(consentAllowsPost(again,{publicationEpoch:3}),true);
  assert.equal(consentAllowsPost(null,{}),true);
  assert.throws(()=>assertPublicationConsent(null,"public"),/publication_consent_required/);
  assert.throws(()=>assertPublicationConsent(off,"friends"),/publication_consent_required/);
});
test("automatic publication excludes historical, private, incomplete and deleted catches",()=>{
  const receipt={version:1,mode:"public",epoch:1,acceptedAt:Date.parse("2026-11-19T10:00:00Z")};
  const record={createdAt:"2026-11-19T11:00:00Z",caughtAt:"2026-11-19T11:00:00Z",speciesKey:"kapr",privacy:{visibility:"public"}};
  assert.equal(automaticCatchEligible(record,receipt),true);
  for(const patch of [{createdAt:"2026-11-18"},{caughtAt:"2026-11-18"},{privacy:{visibility:"private"}},{speciesKey:""},{deleted:true}]) assert.equal(automaticCatchEligible({...record,...patch},receipt),false);
  assert.equal(automaticCatchEligible(record,{...receipt,mode:"private"}),false);
});
