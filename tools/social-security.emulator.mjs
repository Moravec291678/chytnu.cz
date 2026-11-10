import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, setDoc, updateDoc } from "firebase/firestore";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080") throw new Error("Local Firestore emulator required.");
const env = await initializeTestEnvironment({ projectId: "demo-chytnucz-local", firestore: {
  host: "127.0.0.1", port: 8080, rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
} });
const a = "social-fixture-a", b = "social-fixture-b", c = "social-fixture-c";
const paths = [
  `publicProfiles/${a}`, "publicHandles/fixture_a", "socialRelationships/fixture-pair",
  "socialPosts/fixture-public", "socialPosts/fixture-private", "socialPosts/fixture-friends",
  "socialPosts/fixture-public/comments/fixture-comment", `socialPosts/fixture-public/reactions/${a}`,
  `socialBlocks/${a}/blocked/${b}`, "nearbyPresence/fixture-session", "waterPresence/fixture-session",
  "waterRooms/ris-aaaaaaaaaaaaaaaaaaaaaaaa", "waterRooms/ris-aaaaaaaaaaaaaaaaaaaaaaaa/messages/fixture-message",
  "privateConversations/fixture-conversation", "crews/fixture-crew",
];
let checks = 0;
async function denied(promise) { await assertFails(promise); checks++; }
try {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const path of paths) await setDoc(doc(db, path), { ownerId: a, visibility: path.includes("private") ? "PRIVATE" : path.includes("friends") ? "FRIENDS" : "PUBLIC", text: "Synthetic fixture only" });
    await setDoc(doc(db, `users/${a}/catches/social-legacy-fixture`), { ownerId: a, notes: "Private legacy catch", coordinates: { latitude: 50.123456, longitude: 14.123456 } });
    await setDoc(doc(db, "adminAccounts/social-fixture-owner"), { role: "OWNER" });
    await setDoc(doc(db, "adminAccounts/social-fixture-co"), { role: "CO_CREATOR" });
  });
  const accounts = [
    env.authenticatedContext(a), env.authenticatedContext(b), env.authenticatedContext(c), env.unauthenticatedContext(),
    env.authenticatedContext("social-fixture-owner", { role: "OWNER", admin: true }),
    env.authenticatedContext("social-fixture-co", { role: "CO_CREATOR", admin: true }),
  ];
  // A and B are independent authenticated identities; C is an unrelated identity.
  // Even explicitly public projections stay inaccessible until the guarded API ships.
  for (const context of accounts) {
    const db = context.firestore();
    for (const path of paths) {
      await denied(getDoc(doc(db, path)));
      await denied(setDoc(doc(db, path), { ownerId: a, role: "OWNER", visibility: "PUBLIC" }));
    }
    await denied(getDocs(query(collection(db, "publicProfiles"), limit(10))));
    await denied(getDocs(query(collection(db, "socialPosts"), limit(10))));
    await denied(getDocs(query(collection(db, `socialBlocks/${a}/blocked`), limit(10))));
    if (context !== accounts[0]) await denied(getDoc(doc(db, `users/${a}/catches/social-legacy-fixture`)));
  }
  const own = accounts[0].firestore();
  for (const path of paths) {
    await denied(updateDoc(doc(own, path), { ownerId: b }));
    await denied(deleteDoc(doc(own, path)));
  }
  const legacy = await assertSucceeds(getDoc(doc(own, `users/${a}/catches/social-legacy-fixture`)));
  assert.equal(legacy.data().notes, "Private legacy catch"); checks++;
  assert.deepEqual(legacy.data().coordinates, { latitude: 50.123456, longitude: 14.123456 }); checks++;
  await denied(setDoc(doc(accounts[1].firestore(), `users/${a}/catches/social-legacy-fixture`), { ownerId: b }));
  console.log(`Social foundation rules: ${checks} checks PASS (server-only; no public rollout).`);
} finally {
  // Do not clear the shared emulator database or alter other suites' fixtures.
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const path of [...paths, `users/${a}/catches/social-legacy-fixture`, "adminAccounts/social-fixture-owner", "adminAccounts/social-fixture-co"]) await deleteDoc(doc(db, path));
  });
  await env.cleanup();
}
