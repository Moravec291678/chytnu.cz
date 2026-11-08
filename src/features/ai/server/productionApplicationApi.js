import { AI_FEATURES } from "../aiPolicy.js";
import { createAiApplicationApi, createFirebaseAiApplicationDependencies } from "./aiApplicationApi.js";
import { createFirebaseSpeciesDependencies } from "./productionSpeciesApi.js";
import { CLOUDFLARE_ZERO_COST_MODEL, createCloudflareSpeciesProvider, createCloudflareTextProvider, createCloudflareAnalysisProvider, createCloudflareHomeProvider } from "./cloudflareProvider.js";
import { buildPersonalFishingAnalysis } from "../personalFishingAnalysis.js";
import { createZeroCostQuota, blockZeroCostQuota } from "./zeroCostQuota.js";
import { getAccountDeletionAdminContext } from "../../../server/cloudinaryApi.js";
import { createAiRequestLease } from "./aiRequestLease.js";
import { loadAdminRuntime } from "../../admin/server/adminAccess.js";
import { isRuntimeFeatureEnabled } from "../../admin/adminPolicy.js";
import { createAiOperationalDiagnostics } from "./aiOperationalDiagnostics.js";

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
      authorizeRuntime: async (uid, capability) => {
        const { db } = await getAccountDeletionAdminContext(env);
        const { access, config } = await loadAdminRuntime(db, uid, { env });
        return !access.suspended && isRuntimeFeatureEnabled(capability, access, config);
      },
      recordInference: async outcome => {
        const { db } = await getAccountDeletionAdminContext(env);
        return createAiOperationalDiagnostics({ db })(outcome);
      },
      consumeRateLimit: async (uid, options) => {
        const { db, Timestamp } = await getAccountDeletionAdminContext(env);
        return createZeroCostQuota({ db, Timestamp, detailed: true, env })(uid, options);
      },
      claimRequest: async (uid, key, options) => {
        const { db } = await getAccountDeletionAdminContext(env);
        return createAiRequestLease({ db }).claim(uid, key, options);
      },
      finishRequest: async (uid, key, ticket, options) => {
        const { db } = await getAccountDeletionAdminContext(env);
        return createAiRequestLease({ db }).finish(uid, key, ticket, options);
      },
      speciesProvider: createCloudflareSpeciesProvider(configuration),
      textProvider: createCloudflareTextProvider(configuration),
      analysisProvider: createCloudflareAnalysisProvider(configuration),
      homeProvider: createCloudflareHomeProvider(configuration),
      buildHomeAnalysis: ({ catches, trips, waters }) => buildPersonalFishingAnalysis(catches, { trips, waters }),
    });
  } catch { return createAiApplicationApi(); }
}
