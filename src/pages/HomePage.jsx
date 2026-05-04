import Layout from "../components/Layout";
import { useCatches } from "../context/CatchContext";
import SpeciesCard from "../components/SpeciesCard";
import { getSeason } from "../utils/helpers";
import "../styles/HomePage.css";

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
  const sortedCatches = speciesGroups.sort(
    (
      [, { count: aCount, catches: aCatches }],
      [, { count: bCount, catches: bCatches }],
    ) => {
      if (state.sortBy === "nejvice") return bCount - aCount;
      if (state.sortBy === "nejmene") return aCount - bCount;
      if (state.sortBy === "nejnovejsi") {
        return (
          Math.max(...bCatches.map((item) => item.caughtAt)) -
          Math.max(...aCatches.map((item) => item.caughtAt))
        );
      }
      return 0;
    },
  );

  return (
    <Layout>
      <header className="home-header">
        <div className="home-header-top">
          <div>
            <h1>ChytnuCz</h1>
            <p>
              {getSeason()} {year} · {state.catches.length} úlovků ·{" "}
              {speciesGroups.length} druhů
            </p>
          </div>
          <div className="home-header-actions">
            <button className="header-btn">🔔</button>
          </div>
        </div>

        <div className="filter-bar">
          <button
            onClick={() => dispatch({ type: "SET_SORT", payload: "vse" })}
            className={state.sortBy === "vse" ? "chip chip-active" : "chip"}
          >
            Vše
          </button>
          <button
            onClick={() => dispatch({ type: "SET_SORT", payload: "nejvice" })}
            className={state.sortBy === "nejvice" ? "chip chip-active" : "chip"}
          >
            Nejvíce
          </button>
          <button
            onClick={() => dispatch({ type: "SET_SORT", payload: "nejmene" })}
            className={state.sortBy === "nejmene" ? "chip chip-active" : "chip"}
          >
            Nejméně
          </button>
          <button
            onClick={() =>
              dispatch({ type: "SET_SORT", payload: "nejnovejsi" })
            }
            className={
              state.sortBy === "nejnovejsi" ? "chip chip-active" : "chip"
            }
          >
            Nejnovější
          </button>
        </div>
      </header>

      {sortedCatches.map(([speciesKey, data]) => {
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
