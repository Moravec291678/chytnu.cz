import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { buildGalleryItems, countActiveGalleryFilters, filterAndSortGallery, getGalleryOptions, getGalleryPhotoLoadRequest } from "./catchGallery.js";
import GalleryPhotoImage from "../../../pages/GalleryPhotoImage.js";

const catches = [
  { id: "c1", species: "Štika", speciesKey: "esox-lucius", caughtAt: "2026-10-02T12:00:00Z", waterId: "w1", locationName: "Labe", isFavorite: true, weightKg: 4, primaryPhotoId: "p2", photos: [{ id: "p1", blob: new Blob(["a"]) }, { id: "p2", blob: new Blob(["b"]), focalX: 0.2, focalY: 0.8, zoom: 1.4 }] },
  { id: "c2", species: "Kapr", speciesKey: "cyprinus-carpio", caughtAt: "2025-04-05T12:00:00Z", locationName: "Rybník", isFavorite: false, weightKg: 8, photos: [{ id: "p3" }] },
];
const items = buildGalleryItems(catches);

test("gallery flattens every catch photo and retains primary, crop, and missing-byte state", () => {
  assert.equal(items.length, 3);
  assert.equal(items.find((item) => item.photoId === "p2").isPrimary, true);
  assert.deepEqual([items[1].focalX, items[1].focalY, items[1].zoom], [0.2, 0.8, 1.4]);
  assert.equal(items[2].hasLocalBytes, false);
});

test("options come from actual records and use stable species and water keys", () => {
  const options = getGalleryOptions(items);
  assert(options.species.some((item) => item.key === "esox-lucius"));
  assert(options.waters.some((item) => item.key === "id:w1"));
  assert(options.waters.some((item) => item.key === "name:rybnik"));
});

test("all photos show by default; species, water, favorite and accent-insensitive search filters work", () => {
  assert.equal(filterAndSortGallery(items).length, 3);
  assert.deepEqual(filterAndSortGallery(items, { speciesKey: "esox-lucius" }).map((item) => item.photoId), ["p1", "p2"]);
  assert.deepEqual(filterAndSortGallery(items, { waterKey: "id:w1" }).map((item) => item.catchId), ["c1", "c1"]);
  assert(filterAndSortGallery(items, { favoriteOnly: true }).every((item) => item.catchId === "c1"));
  assert(filterAndSortGallery(items, { search: "stika" }).length === 2);
  assert(filterAndSortGallery(items, { search: "rybnik" }).some((item) => item.catchId === "c2"));
});

test("gallery filter panel contains four filters, clear/apply actions, and no primary-photo filter", async () => {
  const page = await readFile(new URL("../../../pages/GalleryPage.jsx", import.meta.url), "utf8");
  assert.match(page, /Filtry\{activeFilterCount > 0/);
  assert.match(page, /aria-controls="gallery-filter-panel"/);
  assert.match(page, /Druh<select/);
  assert.match(page, /Voda \/ revír<select/);
  assert.match(page, /Období<select/);
  assert.match(page, /Pouze oblíbené/);
  assert.match(page, /Vymazat filtry/);
  assert.match(page, />Použít</);
  assert.doesNotMatch(page, /primaryOnly|Hlavní foto<|gallery-chip/);
});

test("active filter count excludes search and sort", () => {
  assert.equal(countActiveGalleryFilters({ search: "kapr", sort: "oldest" }), 0);
  assert.equal(countActiveGalleryFilters({ speciesKey: "carp", search: "kapr", sort: "oldest" }), 1);
  assert.equal(countActiveGalleryFilters({ speciesKey: "carp", waterKey: "id:w1", period: "year", favoriteOnly: true }), 4);
});

test("gallery normalizes legacy, guest, local, remote and multi-photo records without needing a nested Catch", () => {
  const localBlob = new Blob(["local photo"], { type: "image/jpeg" });
  const catchesWithPhotos = buildGalleryItems([
    { id: "legacy", photos: [{ blob: localBlob }] },
    { id: "remote-catch", ownerId: "account-7", photos: [
      { id: "remote-photo", size: 20, type: "image/jpeg", cloud: { state: "synced", provider: "fake", objectKey: "users/account-7/catches/remote-catch/photos/remote-photo/original", sha256: "a".repeat(64) } },
      { id: "second-photo", blob: localBlob },
    ] },
  ], { ownerId: "account-7" });
  assert.equal(catchesWithPhotos.length, 3);
  assert.equal(catchesWithPhotos[0].ownerId, "account-7", "legacy account record gets the active account owner at mapping time");
  assert.equal(catchesWithPhotos[0].cloud.state, "localOnly", "legacy photo metadata receives a safe local-only default");
  assert.equal(catchesWithPhotos[0].blob, localBlob);
  const guestItem = buildGalleryItems([{ id: "guest-catch", photos: [{ blob: localBlob }] }])[0];
  assert.equal(guestItem.ownerId, null, "guest Catch does not invent an account owner");
  assert.equal(getGalleryPhotoLoadRequest(guestItem, { status: "guest", ownerId: null, scopeKey: "guest:device" }).kind, "local");
  assert.equal(catchesWithPhotos[1].ownerId, "account-7");
  assert.equal(catchesWithPhotos[1].catchId, "remote-catch");
  assert.equal(catchesWithPhotos[1].photoId, "remote-photo");
  assert.equal(catchesWithPhotos[2].photoId, "second-photo");
  assert.equal(getGalleryPhotoLoadRequest(catchesWithPhotos[0], undefined).kind, "local");
  assert.deepEqual(getGalleryPhotoLoadRequest(catchesWithPhotos[1], { status: "ready", ownerId: "account-7", scopeKey: "account:account-7" }), {
    kind: "remote",
    options: { photo: catchesWithPhotos[1], ownerId: "account-7", catchId: "remote-catch", scopeKey: "account:account-7" },
  });
  assert.equal(getGalleryPhotoLoadRequest(catchesWithPhotos[1], { status: "guest", ownerId: null, scopeKey: "guest" }).kind, "missing");
});

test("GalleryPhotoImage renders safely without scope, nested Catch, or local photo bytes", () => {
  const item = { id: "remote-photo", photoId: "remote-photo", catchId: "remote-catch", ownerId: "account-7",
    cloud: { state: "synced", provider: "fake", objectKey: "object-key", sha256: "a".repeat(64) }, blob: null };
  assert.doesNotThrow(() => renderToStaticMarkup(createElement(GalleryPhotoImage, { item })));
  assert.match(renderToStaticMarkup(createElement(GalleryPhotoImage, { item })), /cloudová metadata/);
  const local = { ...item, blob: new Blob(["photo"], { type: "image/jpeg" }) };
  assert.match(renderToStaticMarkup(createElement(GalleryPhotoImage, { item: local })), /<img/);
  assert.doesNotThrow(() => renderToStaticMarkup(createElement(GalleryPhotoImage, { item: null })));
});

test("date periods and custom ranges use catch dates", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  assert.deepEqual(filterAndSortGallery(items, { period: "month" }, now).map((item) => item.catchId), ["c1", "c1"]);
  assert.deepEqual(filterAndSortGallery(items, { period: "year" }, now).map((item) => item.catchId), ["c1", "c1"]);
  assert.deepEqual(filterAndSortGallery(items, { period: "custom:range", dateFrom: "2025-01-01", dateTo: "2025-12-31" }, now).map((item) => item.catchId), ["c2"]);
});

test("sorting newest, oldest, and heaviest produces deterministic photo order", () => {
  assert.equal(filterAndSortGallery(items, { sort: "newest" })[0].catchId, "c1");
  assert.equal(filterAndSortGallery(items, { sort: "oldest" })[0].catchId, "c2");
  assert.equal(filterAndSortGallery(items, { sort: "heaviest" })[0].catchId, "c2");
});

test("gallery route and primary Profile entry are connected without changing bottom navigation", async () => {
  const [app, profile, layout] = await Promise.all([
    readFile(new URL("../../../app/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../../pages/ProfilePage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../../shared/layout/Layout.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /path="\/gallery"/);
  assert.match(profile, /to="\/gallery"[^>]*>.*Galerie/s);
  assert.match(layout, /aria-label="Hlavní navigace"/);
  assert.match(layout, /nav-label">Domů[\s\S]*nav-label">Deník[\s\S]*nav-label">Výlety[\s\S]*nav-label">Profil/);
  assert.doesNotMatch(layout, /to="\/gallery"/);
});

test("viewer supports filtered-list navigation, keyboard, swipe, Catch detail, and URL cleanup", async () => {
  const [page, photoImage] = await Promise.all([
    readFile(new URL("../../../pages/GalleryPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../../pages/GalleryPhotoImage.js", import.meta.url), "utf8"),
  ]);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(page, /event\.key === "ArrowRight"/);
  assert.match(page, /event\.key === "ArrowLeft"/);
  assert.match(page, /onTouchStart/);
  assert.match(page, /to=\{`\/catch\/\$\{item\.catchId\}`\}/);
  assert.match(photoImage, /URL\.revokeObjectURL\(objectUrlRef\.current\)/);
  assert.match(page, /aria-modal="true"/);
  assert.doesNotMatch(page, /item\.gps|item\.notes|syncId/);
  assert.match(page, /scope\.ownerId/);
});

test("gallery CSS keeps two columns on narrow screens and expands for desktop", async () => {
  const css = await readFile(new URL("../../../pages/GalleryPage.css", import.meta.url), "utf8");
  assert.match(css, /\.gallery-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(min-width:700px\).*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/s);
  assert.match(css, /@media\(min-width:1100px\).*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/s);
  assert.match(css, /\.layout\.layout-gallery\{max-width:1100px\}/);
  assert.match(css, /safe-area-inset/);
  assert.match(css, /\.gallery-controls\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.gallery-control-row\{display:flex;align-items:center;justify-content:space-between/);
  assert.match(css, /@media\(min-width:700px\)\{\.gallery-page[\s\S]*?\.gallery-controls\{grid-template-columns:minmax\(220px,380px\) auto/);
  assert.match(css, /\.gallery-filter-backdrop\{position:fixed/);
  assert.match(css, /@media\(min-width:700px\)[\s\S]*?\.gallery-filter-backdrop\{position:absolute/);
});
