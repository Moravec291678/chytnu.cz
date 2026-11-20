import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Nearby UI requires opt-in, explicit coarse-area consent and provides immediate opt-out", async () => {
  const source = await readFile(new URL("./NearbyPage.jsx", import.meta.url), "utf8");
  assert.match(source, /settings\.nearbyOptIn \|\| settings\.nearbyLocationPrecision !== "approximate" \|\| !presenceConsent/);
  assert.match(source, /checked=\{currentConsent\}/);
  assert.match(source, /socialRequest\("nearby\.consent", \{ accepted, showProfile: shareProfile \}, \{ expectedUid: scope\.ownerId \}\)/);
  assert.match(source, /socialRequest\("nearby\.join", \{ latitude: position\.coords\.latitude, longitude: position\.coords\.longitude \}, \{ expectedUid: scope\.ownerId \}\)/);
  assert.match(source, /socialRequest\("nearby\.consent", \{ accepted: false \}, \{ expectedUid: scope\.ownerId \}\)/);
  assert.match(source, /Vypnout moje sdílení/);
  assert.match(source, /Dovoluji zobrazit odkaz na svůj dohledatelný veřejný profil/);
  assert.match(source, /socialRequest\("nearby\.discover", \{\}, \{ expectedUid: scope\.ownerId \}\)/);
  assert.match(source, /Počet účastníků se zobrazí až od pěti lidí/);
  assert.match(source, /po 20 minutách/);
});
