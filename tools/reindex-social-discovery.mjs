// Operator-only maintenance. Uses existing local Firebase CLI login in memory;
// never pulls Vercel secrets, prints credentials or exposes a public migration API.
import { createRequire } from "node:module";
import { Firestore, FieldPath } from "@google-cloud/firestore";
import { reindexDiscoveryPage } from "../src/features/social/server/discoveryBackfill.js";
const require = createRequire(import.meta.url);
const args = new Set(process.argv.slice(2));
if ([...args].some(arg => !["--apply", "--verify-indexes", "--verify-friends"].includes(arg)) || process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Explicit production operator command only");
const { configstore } = require("firebase-tools/lib/configstore.js");
const { clientId, clientSecret } = require("firebase-tools/lib/api.js");
const refresh = configstore.get("tokens")?.refresh_token;
if (!refresh) throw new Error("Firebase CLI login required; run firebase login");
const db = new Firestore({ projectId: "chutnucz", credentials: { type: "authorized_user", client_id: clientId(), client_secret: clientSecret(), refresh_token: refresh } });
try {
  if (args.has("--verify-friends")) {
    for (const status of ["accepted", "pending"]) await db.collection("socialRelationships").where("memberUids", "array-contains", "operator-unused-no-account").where("status", "==", status).orderBy(FieldPath.documentId()).limit(1).get();
    console.log(JSON.stringify({ project: "chutnucz", friendsIndexesVerified: 2 }));
  } else if (args.has("--verify-indexes")) {
    const base = () => db.collection("publicProfiles").where("visibility", "==", "public").where("discoverable", "==", true);
    await base().where("searchPrefixes", "array-contains", "all:operator_unused_search_fixture").orderBy("handle").orderBy(FieldPath.documentId()).limit(1).get();
    await base().where("searchPrefixes", "array-contains", "directory:new").orderBy("createdAt", "desc").orderBy(FieldPath.documentId()).limit(1).get();
    console.log(JSON.stringify({ project: "chutnucz", indexesVerified: 2 }));
  } else if (!args.has("--apply")) {
    const page = await db.collection("publicProfiles").limit(25).get();
    console.log(JSON.stringify({ project: "chutnucz", mode: "read-only", sampled: page.size }));
  } else {
    const state = db.doc("adminDirectoryState/socialDiscoveryBackfill"), previous = (await state.get()).data();
    let cursor = previous?.completed ? null : previous?.cursor ?? null;
    const totals = { project: "chutnucz", scanned: 0, updated: 0, invalid: 0, completed: false };
    for (let i = 0; i < 100; i++) {
      const page = await reindexDiscoveryPage({ db, cursor });
      totals.scanned += page.scanned; totals.updated += page.updated; totals.invalid += page.invalid;
      cursor = page.nextCursor; totals.completed = !cursor;
      await state.set({ cursor, completed: totals.completed, version: 1, updatedAt: Date.now() });
      if (!cursor) break;
    }
    console.log(JSON.stringify(totals));
    if (!totals.completed) process.exitCode = 2;
  }
} catch (error) {
  console.error(JSON.stringify({ error: "discovery_maintenance_failed", code: typeof error.code === "number" ? error.code : "unavailable" }));
  process.exitCode = 1;
} finally { await db.terminate(); }
