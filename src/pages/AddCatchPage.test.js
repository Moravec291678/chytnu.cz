import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Quick Add and Full Add share a length-first two-column measurement layout", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("./AddCatchPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("./AddCatchPage.css", import.meta.url), "utf8"),
  ]);
  const gridStart = source.indexOf('"measurements-grid measurements-grid-full"');
  const gridEnd = source.indexOf("{displayFull && (", gridStart);
  const grid = source.slice(gridStart, gridEnd);
  assert.ok(grid.indexOf("Délka (cm)") >= 0);
  assert.ok(grid.indexOf("Délka (cm)") < grid.indexOf("Váha (kg)"));
  assert.match(styles, /\.measurements-grid\s*\{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test("new Catch applies profile visibility defaults before it can be saved and leaves editing data alone", async () => {
  const source = await readFile(new URL("./AddCatchPage.jsx", import.meta.url), "utf8");
  assert.match(source, /privacy: createCatchPrivacyFromDefaults\(DEFAULT_PRIVACY_SETTINGS\)/);
  assert.match(source, /privacy: createCatchPrivacyFromDefaults\(defaults\)/);
  assert.match(source, /if \(id \|\| scope\.status !== "ready"/);
  assert.match(source, /privacyRepository\.get\(scope\)\.then/);
  assert.match(source, /!draftReady \|\| !privacyDefaultsReady/);
  assert.match(source, /const values = catchToForm\(existingCatch\)/);
});

test("Add Catch attempts optional GPS autofill, selects a nearby saved water, and fills conditions in Quick Add too", async () => {
  const [source, weather] = await Promise.all([
    readFile(new URL("./AddCatchPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../shared/data/catchWeather.js", import.meta.url), "utf8"),
  ]);
  assert.match(source, /locationAdapter\.getCurrentPosition\(/);
  assert.match(source, /getLocationAdapter\(\)/);
  assert.match(source, /gpsManuallyEditedRef\.current\) return/);
  assert.match(source, /gpsManuallyEdited: gpsManuallyEditedRef\.current/);
  assert.match(source, /tripManuallyEdited: tripManuallyEditedRef\.current/);
  assert.match(source, /tripState\.loading \|\| tripManuallyEditedRef\.current/);
  assert.match(source, /setCatchData\(\(previous\) => \{\s*if \(previous\.coordinates \|\| previous\.gpsLocation\) return previous/s);
  assert.match(source, /findNearestSavedWater\(catchData\.coordinates, availableWaters\)/);
  assert.match(source, /calculateMoonPhase\(catchData\.catchDate, catchData\.catchTime\)/);
  assert.match(source, /fetchCatchWeather\(coordinates\.latitude, coordinates\.longitude, catchData\.catchDate, catchData\.catchTime/);
  assert.doesNotMatch(source, /if \(!displayFull\) return undefined;\s*const controller = new AbortController\(\)/);
  assert.match(weather, /temperature_2m,surface_pressure,wind_speed_10m/);
});

test("Add Catch photo manager keeps the primary photo dominant, shows legacy thumbnails, and caps additions at four", async () => {
  const [source, styles, photoModel] = await Promise.all([
    readFile(new URL("./AddCatchPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("./AddCatchPage.css", import.meta.url), "utf8"),
    readFile(new URL("../features/catches/data/catchPhotos.js", import.meta.url), "utf8"),
  ]);
  assert.match(photoModel, /MAX_PHOTOS_PER_CATCH = 4/);
  assert.match(photoModel, /MAX_LEGACY_PHOTOS_PER_CATCH = 10/);
  assert.match(source, /catchData\.photos\.length < MAX_PHOTOS_PER_CATCH/);
  assert.match(source, /photo-preview-primary/);
  assert.match(source, /photo-preview-thumbnail/);
  assert.match(source, /Nastavit hlavní/);
  assert.match(source, /Upravit výřez/);
  assert.match(source, /removePhoto\(item\.id\)/);
  assert.match(styles, /\.catch-photo-manager \.photo-preview-primary \{ grid-column: 1 \/ -1;/);
  assert.match(styles, /\.catch-photo-manager \.photo-preview-thumbnail img \{[^}]*height: 86px/s);
});
