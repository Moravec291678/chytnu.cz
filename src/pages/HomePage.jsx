import Layout from "../components/Layout";
import { useCatches } from "../context/CatchContext";
import { TEST_CATCHES } from "../utils/mockData";
import SpeciesCard from "../components/speciesCard";

function HomePage() {
  const { state, dispatch } = useCatches();
  const reducedCatches = TEST_CATCHES.reduce((acc, catchItem) => {
    const key = catchItem.speciesKey;
    if (!acc[key]) {
      acc[key] = {
        count: 0,
        catches: [],
      };
    }
    acc[key].count += 1;
    acc[key].catches.push(catchItem);

    return acc;
  }, {});
  const speciesGroups = Object.entries(reducedCatches);
  return (
    <Layout>
      {speciesGroups.map(([speciesKey, data]) => {
        const biggest = data.catches.reduce((max, item) => {
          return item.weightKg > max.weightKg ? item : max;
        });
        return (
          <SpeciesCard
            key={speciesKey}
            speciesKey={speciesKey}
            data={data}
            biggest={biggest}
          />
        );
      })}
    </Layout>
  );
}

export default HomePage;
