import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import AddCatchPage from "./pages/AddCatchPage";
import CatchDetailPage from "./pages/CatchDetailPage";
import GalleryPage from "./pages/GalleryPage";
import StatsPage from "./pages/StatsPage";
import TripsPage from "./pages/TripsPage";
function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
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
