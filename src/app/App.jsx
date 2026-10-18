import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import {
  AddCatchPage,
  CatchDetailPage,
  GalleryPage,
  HomePage,
  ProfilePage,
  SpeciesDetailPage,
  SpeciesAlbumPage,
  StatsPage,
  TripsPage,
} from "../pages";
import TripCreatePage from "../pages/TripCreatePage";
import TripDetailPage from "../pages/TripDetailPage";
import TripEditPage from "../pages/TripEditPage";
import Layout from "../shared/layout/Layout";
import { Link } from "react-router-dom";

const MapPage = lazy(() => import("../pages/MapPage"));

function NotFoundPage() {
  return <Layout><section className="add-catch-section"><h1>Stránka nenalezena</h1><p>Požadovaná stránka neexistuje nebo byla přesunuta.</p><Link to="/">Zpět do deníku</Link></section></Layout>;
}

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/species/:speciesKey" element={<SpeciesDetailPage />} />
        <Route path="/album" element={<SpeciesAlbumPage />} />
        <Route path="/map" element={<Suspense fallback={<Layout><p>Načítám mapu…</p></Layout>}><MapPage /></Suspense>} />
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
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

export default App;
