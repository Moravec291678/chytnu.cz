import Layout from "../components/Layout";
import { useCatches } from "../context/CatchContext";
import SpeciesCard from "../components/SpeciesCard";
import { getSeason } from "../utils/helpers";
import "../styles/HomePage.css";
import { useState } from "react";
import FishActivity from "../components/FishActivity";

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
  const [sortOpen, setSortOpen] = useState(false);
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
      if (state.sortBy === "nejtezsi") {
        const aMax = Math.max(...aCatches.map((item) => item.weightKg));
        const bMax = Math.max(...bCatches.map((item) => item.weightKg));
        return bMax - aMax;
      }
      if (state.sortBy === "nejlehci") {
        const aMin = Math.min(...aCatches.map((item) => item.weightKg));
        const bMin = Math.min(...bCatches.map((item) => item.weightKg));
        return aMin - bMin;
      }

      if (state.sortBy === "nejdelsi") {
        const aMax = Math.max(...aCatches.map((item) => item.lengthCm));
        const bMax = Math.max(...bCatches.map((item) => item.lengthCm));
        return bMax - aMax;
      }

      if (state.sortBy === "nejkratsi") {
        const aMin = Math.min(...aCatches.map((item) => item.lengthCm));
        const bMin = Math.min(...bCatches.map((item) => item.lengthCm));
        return aMin - bMin;
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

          <div className="sort-wrapper">
            <button
              className={
                sortOpen || state.sortBy !== "vse" ? "chip chip-active" : "chip"
              }
              onClick={() => setSortOpen(!sortOpen)}
            >
              Seřadit ▾
            </button>

            {sortOpen && (
              <div className="sort-dropdown">
                {[
                  { key: "nejnovejsi", label: "📅 Nejnovější" },
                  { key: "nejvice", label: "🔢 Nejvíce úlovků" },
                  { key: "nejmene", label: "🔢 Nejméně úlovků" },
                  { key: "nejtezsi", label: "⚖️ Nejtěžší" },
                  { key: "nejlehci", label: "⚖️ Nejlehčí" },
                  { key: "nejdelsi", label: "📏 Nejdelší" },
                  { key: "nejkratsi", label: "📏 Nejkratší" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    className={
                      state.sortBy === key
                        ? "sort-item sort-item-active"
                        : "sort-item"
                    }
                    onClick={() => {
                      dispatch({ type: "SET_SORT", payload: key });
                      setSortOpen(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>
      <FishActivity />
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
