import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("application errors show a safe accessible recovery screen around all providers", async () => {
  const [boundary, main] = await Promise.all([
    readFile(new URL("./AppErrorBoundary.jsx", import.meta.url), "utf8"),
    readFile(new URL("../main.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(boundary, /static getDerivedStateFromError/);
  assert.match(boundary, /role="alert"/);
  assert.match(boundary, /Načíst znovu/);
  assert.doesNotMatch(boundary, /error\.message|error\.stack/);
  assert.match(main, /<AppErrorBoundary>[\s\S]*<AuthProvider>[\s\S]*<App\s*\/>[\s\S]*<\/AppErrorBoundary>/);
});
