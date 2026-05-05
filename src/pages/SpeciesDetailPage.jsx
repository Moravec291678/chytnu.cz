import { useParams } from "react-router-dom";
import { useCatches } from "../context/CatchContext";

function SpeciesDetailPage() {
  const { speciesKey } = useParams();
  const { state } = useCatches();
  const selectedSpecies = state.catches.filter((item) => {
    return item.speciesKey === speciesKey;
  });

  return (
    <>
      Species Detail
      <p>cpecies: {speciesKey}</p>
      {selectedSpecies.map((item) => {
        return (
          <div key={item.id} className="species-detail-card">
            <h1>{item.species}</h1>
          </div>
        );
      })}
    </>
  );
}

export default SpeciesDetailPage;
