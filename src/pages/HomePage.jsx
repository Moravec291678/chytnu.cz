import Layout from "../components/Layout";
import { useCatches } from "../context/CatchContext";
import { TEST_CATCHES } from "../utils/mockData";

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
          <div key={speciesKey} className="fish-card">
            <p>{speciesKey}</p>
            <p>{data.count}</p>
            <p>{biggest.weightKg} kg</p>
            <p>{biggest.lengthCm} cm</p>
          </div>
        );
      })}
    </Layout>
  );
}

export default HomePage;
