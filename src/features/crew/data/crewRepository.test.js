import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { accountScopeKey } from "../../auth/data/localDataScope.js";
import { CREW_MAX_MEMBERS, CREW_MIN_MEMBERS } from "./crewModel.js";
import { crewRepository } from "./crewRepository.js";

async function resetDatabase() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("chytnu-crew-local");
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}

const firstScope = { scopeKey: accountScopeKey("crew-owner-a"), ownerId: "crew-owner-a" };
const secondScope = { scopeKey: accountScopeKey("crew-owner-b"), ownerId: "crew-owner-b" };

test("local Crew creates a stable scoped draft with only the current user membership", async () => {
  await resetDatabase();
  const created = await crewRepository.create({
    name: "Páteční výpravy",
    privacy: "invite-only",
    challenge: { enabled: true, type: "species-count", target: 5 },
  }, firstScope);

  assert.ok(created.id);
  assert.equal(created.status, "local-draft");
  assert.deepEqual(created.memberKeys, [firstScope.scopeKey]);
  assert.equal(created.memberKeys.length < CREW_MIN_MEMBERS, true);
  assert.equal(created.memberKeys.length <= CREW_MAX_MEMBERS, true);
  assert.equal((await crewRepository.get(firstScope)).id, created.id);
  assert.equal(await crewRepository.get(secondScope), null);
});

test("rename, privacy and challenge configuration persist without inventing remote stats", async () => {
  await resetDatabase();
  const created = await crewRepository.create({ name: "Crew A" }, firstScope);
  const updated = await crewRepository.update(created.id, {
    name: "Crew B",
    privacy: "invite-only",
    challenge: { enabled: true, type: "total-weight", target: 25.5 },
  }, firstScope);

  assert.equal(updated.name, "Crew B");
  assert.equal(updated.privacy, "invite-only");
  assert.deepEqual(updated.challenge, { enabled: true, type: "total-weight", target: 25.5 });
  assert.deepEqual((await crewRepository.get(firstScope)).challenge, updated.challenge);
  await assert.rejects(() => crewRepository.update(created.id, { name: "Cizí Crew" }, secondScope));
});

test("owner can leave and delete their own local Crew without affecting another scope", async () => {
  await resetDatabase();
  const first = await crewRepository.create({ name: "První Crew" }, firstScope);
  const second = await crewRepository.create({ name: "Druhá Crew" }, secondScope);

  assert.equal(await crewRepository.leave(first.id, firstScope), true);
  assert.equal(await crewRepository.get(firstScope), null);
  assert.equal((await crewRepository.get(secondScope)).id, second.id);
  await assert.rejects(() => crewRepository.deleteOwn(second.id, firstScope));
});

test("Crew validation rejects blank names, duplicate local Crew and invalid challenge targets", async () => {
  await resetDatabase();
  await assert.rejects(() => crewRepository.create({ name: " " }, firstScope), /alespoň 2/);
  const created = await crewRepository.create({ name: "Validní Crew" }, firstScope);
  await assert.rejects(() => crewRepository.create({ name: "Další Crew" }, firstScope), /už má/);
  await assert.rejects(() => crewRepository.update(created.id, {
    name: "Validní Crew",
    challenge: { enabled: true, type: "catch-count", target: 100001 },
  }, firstScope), /příliš vysoký/);
  await assert.rejects(() => crewRepository.update(created.id, {
    name: "Validní Crew",
    challenge: { enabled: true, type: "catch-count", target: 0 },
  }, firstScope), /kladné číslo/);
});
