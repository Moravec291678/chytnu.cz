import Layout from "../components/Layout";
import { useCatches } from "../context/CatchContext";
import SpeciesCard from "../components/SpeciesCard";
import { getSeason } from "../utils/helpers";

function HomePage() {
  const { state, dispatch } = useCatches();
  const year = new Date().getFullYear();
  const reducedCatches = state.catches.reduce((acc, catchItem) => {
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
      <header className="home-header">
        <div className="home-header-top">
          <div className="home-header-rg">
            <h1>ChytnuCz</h1>
            <div className="home-header-tg-sub">
              <span>
                {getSeason()} {year}
              </span>
              {" · "}
              <span> {state.catches.length} úlovků</span>
              {" · "}
              <span>{speciesGroups.length} druhů</span>
            </div>
          </div>
          <div className="home-header-lf">
            <button>🔔</button>
          </div>
        </div>
        <div className="home-header-bottom">
          
        </div>
      </header>
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
