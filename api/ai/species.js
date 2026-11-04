import { createProductionSpeciesApi } from "../../src/features/ai/server/productionSpeciesApi.js";

// A real adapter exists, but release requires provider/consent/privacy review and
// representative image validation. Environment variables alone cannot activate it.
export default createProductionSpeciesApi();
