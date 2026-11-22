import { useRouteMemory } from "./navigationMemory.js";

export function useRoutePageSize(filters, step) {
  const key = JSON.stringify(filters);
  const [lastPage, setLastPage] = useRouteMemory("listPage", null);
  const visibleCount = lastPage?.key === key ? lastPage.count : step;
  const showMore = () => setLastPage({ key, count: visibleCount + step });
  return [visibleCount, showMore];
}
