import { Routes, Route } from "react-router-dom";
import {
  AddCatchPage,
  CatchDetailPage,
  GalleryPage,
  HomePage,
  ProfilePage,
  SpeciesDetailPage,
  StatsPage,
  TripsPage,
} from "../pages";
import TripCreatePage from "../pages/TripCreatePage";
import TripDetailPage from "../pages/TripDetailPage";
import TripEditPage from "../pages/TripEditPage";
function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/species/:speciesKey" element={<SpeciesDetailPage />} />
        <Route path="/add" element={<AddCatchPage />} />
        <Route path="/catch/:id" element={<CatchDetailPage />} />
        <Route path="/catch/:id/edit" element={<AddCatchPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/trips/new" element={<TripCreatePage />} />
        <Route path="/trips/:id" element={<TripDetailPage />} />
        <Route path="/trips/:id/edit" element={<TripEditPage />} />
      </Routes>
    </>
  );
}

export default App;
