import { AI_FEATURES } from "../aiPolicy.js";
import { createAiApplicationApi, createFirebaseAiApplicationDependencies } from "./aiApplicationApi.js";
import { createFirebaseSpeciesDependencies } from "./productionSpeciesApi.js";
import { CLOUDFLARE_ZERO_COST_MODEL, createCloudflareSpeciesProvider, createCloudflareTextProvider, createCloudflareAnalysisProvider } from "./cloudflareProvider.js";
import { createZeroCostQuota, blockZeroCostQuota } from "./zeroCostQuota.js";
import { getAccountDeletionAdminContext } from "../../../server/cloudinaryApi.js";

export function createProductionAiApplication({ env = globalThis.process?.env ?? {}, features = AI_FEATURES } = {}) {
  const enabled = Object.values(features).some(value => value === true) && env.AI_PROVIDER === "cloudflare"
    && env.AI_ZERO_COST_CONFIRMED === "true" && env.AI_CLOUDFLARE_MODEL === CLOUDFLARE_ZERO_COST_MODEL;
  if (!enabled) return createAiApplicationApi();
  try {
    const configuration = { accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_API_TOKEN,
      model: env.AI_CLOUDFLARE_MODEL, onQuotaExhausted: async () => {
        const { db, Timestamp } = await getAccountDeletionAdminContext(env);
        await blockZeroCostQuota({ db, Timestamp });
      } };
    return createAiApplicationApi({ enabled, features, providerName: "cloudflare", modelId: CLOUDFLARE_ZERO_COST_MODEL,
      ...createFirebaseSpeciesDependencies({ env }), ...createFirebaseAiApplicationDependencies({ env }),
      consumeRateLimit: async uid => {
        const { db, Timestamp } = await getAccountDeletionAdminContext(env);
        return createZeroCostQuota({ db, Timestamp })(uid);
      },
      speciesProvider: createCloudflareSpeciesProvider(configuration),
      textProvider: createCloudflareTextProvider(configuration),
      analysisProvider: createCloudflareAnalysisProvider(configuration),
    });
  } catch { return createAiApplicationApi(); }
}
