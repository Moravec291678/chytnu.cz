import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { createWaterRecord } from "./waterModel.js";
import { WATER_CHAT_MAX_LENGTH, waterRepository } from "./waterRepository.js";

test("Water Chat sends and reloads the requested message model", async () => {
  const scope = { scopeKey: "chat-model-scope", ownerId: null };
  const water = createWaterRecord({ name: "Testovací voda" }, scope);
  await waterRepository.put(water, scope);

  const sent = await waterRepository.addMessage({
    waterId: water.id,
    scope,
    author: "Místní profil",
    text: "  První zpráva  ",
  });

  assert.deepEqual(Object.keys(sent).sort(), ["author", "createdAt", "id", "scopeKey", "text", "waterId"]);
  assert.equal(sent.waterId, water.id);
  assert.equal(sent.scopeKey, scope.scopeKey);
  assert.equal(sent.author, "Místní profil");
  assert.equal(sent.text, "První zpráva");
  assert.ok(Number.isFinite(Date.parse(sent.createdAt)));

  const reloaded = await waterRepository.listMessages(water.id, scope);
  assert.deepEqual(reloaded, [sent]);
});

test("Water Chat never leaks messages between Waters or scopes", async () => {
  const firstScope = { scopeKey: "chat-isolation-a", ownerId: null };
  const secondScope = { scopeKey: "chat-isolation-b", ownerId: null };
  const firstWater = createWaterRecord({ name: "První voda" }, firstScope);
  const secondWater = createWaterRecord({ name: "Druhá voda" }, firstScope);
  await waterRepository.put(firstWater, firstScope);
  await waterRepository.put(secondWater, firstScope);

  await waterRepository.addMessage({ waterId: firstWater.id, scope: firstScope, author: "Profil A", text: "Jen první voda" });
  await waterRepository.addMessage({ waterId: secondWater.id, scope: firstScope, author: "Profil A", text: "Jen druhá voda" });

  assert.deepEqual((await waterRepository.listMessages(firstWater.id, firstScope)).map((item) => item.text), ["Jen první voda"]);
  assert.deepEqual((await waterRepository.listMessages(secondWater.id, firstScope)).map((item) => item.text), ["Jen druhá voda"]);
  assert.deepEqual(await waterRepository.listMessages(firstWater.id, secondScope), []);
  await assert.rejects(
    waterRepository.addMessage({ waterId: firstWater.id, scope: secondScope, author: "Profil B", text: "Cizí zpráva" }),
    /aktivním profilu/,
  );
});

test("Water Chat rejects empty, overlong and orphan messages", async () => {
  const scope = { scopeKey: "chat-validation-scope", ownerId: null };
  await assert.rejects(waterRepository.addMessage({ waterId: "water", scope, text: "   " }), /prázdná/);
  await assert.rejects(waterRepository.addMessage({ waterId: "water", scope, text: "x".repeat(WATER_CHAT_MAX_LENGTH + 1) }), /maximálně/);
  await assert.rejects(waterRepository.addMessage({ waterId: "", scope, text: "Zpráva" }), /konkrétnímu revíru/);
});
