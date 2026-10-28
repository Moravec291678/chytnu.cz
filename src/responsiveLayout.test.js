import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("modal panels that can grow have a viewport bound and their own scroll region", async () => {
  const [photoFrame, confirmDialog, communityDetail, login] = await Promise.all([
    css("./features/catches/components/PhotoFrameEditor.css"),
    css("./shared/components/ConfirmDialog.css"),
    css("./pages/CommunityCatchDetailPage.css"),
    css("./pages/LoginPage.css"),
  ]);

  for (const [source, selector] of [
    [photoFrame, ".photo-frame-editor"],
    [confirmDialog, ".catch-confirm-dialog"],
    [communityDetail, ".community-detail-report-sheet"],
    [login, ".auth-guest-dialog"],
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    assert.ok(match, `${selector} exists`);
    const block = match[1];
    assert.match(block, /max-height:[^;]*100dvh/, `${selector} is capped to dynamic viewport height`);
    assert.match(block, /overflow-y:\s*auto/, `${selector} remains scrollable when content is taller`);
  }
});

test("Gallery viewer height accounts for iPhone safe areas", async () => {
  const gallery = await css("./pages/GalleryPage.css");
  assert.match(gallery, /\.gallery-viewer\{[^}]*height:min\(900px,calc\(100dvh - env\(\s*safe-area-inset-top\s*\) - env\(\s*safe-area-inset-bottom\s*\)\)\)/);
});
