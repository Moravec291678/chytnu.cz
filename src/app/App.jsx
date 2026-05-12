import { Routes, Route } from "react-router-dom";
import {
  AddCatchPage,
  CatchDetailPage,
  GalleryPage,
  HomePage,
  SpeciesDetailPage,
  StatsPage,
  TripsPage,
} from "../pages";
function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/species/:speciesKey" element={<SpeciesDetailPage />} />
        <Route path="/add" element={<AddCatchPage />} />
        <Route path="/catch/:id" element={<CatchDetailPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/trips" element={<TripsPage />} />
      </Routes>
    </>
  );
}

export default App;
