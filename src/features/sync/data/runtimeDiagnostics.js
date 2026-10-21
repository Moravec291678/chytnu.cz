export function getRuntimeLabel(navigatorObject = globalThis.navigator, windowObject = globalThis.window) {
  if (!navigatorObject) return "Browser";
  const standalone = navigatorObject.standalone === true
    || Boolean(windowObject?.matchMedia?.("(display-mode: standalone)")?.matches);
  const platform = String(navigatorObject.platform ?? "");
  const userAgent = String(navigatorObject.userAgent ?? "");
  const ios = /iPhone|iPad|iPod/i.test(userAgent)
    || (platform === "MacIntel" && Number(navigatorObject.maxTouchPoints) > 1);
  if (ios && standalone) return "iOS Home Screen";
  if (ios && /Safari/i.test(userAgent) && !/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(userAgent)) return "iOS Safari";
  return standalone ? "Standalone" : "Browser";
}
