export { FEATURES } from "../../product/config/featureFlags.js";
import { FEATURES } from "../../product/config/featureFlags.js";

export function isFeatureEnabled(name) {
  return FEATURES[name] === true;
}
