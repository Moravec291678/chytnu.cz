import { createProductionSpeciesApi } from "../../src/features/ai/server/productionSpeciesApi.js";
import { createOperatorAiCheck } from "../../src/features/ai/server/operatorAiCheck.js";

// A real adapter exists, but release requires provider/consent/privacy review and
// representative image validation. Environment variables alone cannot activate it.
const application = createProductionSpeciesApi();
const operator = createOperatorAiCheck();
export default (req, res) => req.body?.action === "operator_check" ? operator(req, res) : application(req, res);
