import { DEFAULT_METHODS } from "../constants/constants";
export function getMethodLabel(trip) {
  const method = DEFAULT_METHODS.find((item) => {
    return item.key === trip.methodKey;
  });
  return method.label;
}
