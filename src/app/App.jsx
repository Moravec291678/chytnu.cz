import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import {
  AddCatchPage,
  CatchDetailPage,
  GalleryPage,
  HomePage,
  JournalPage,
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
import { completeOnboarding, isOnboardingComplete } from "../features/preferences/data/preferences.js";
import { hasLegacyProfileData } from "../features/preferences/data/legacyProfile.js";
import { useDataScope } from "../features/auth/context/dataScopeContextValue.js";
import { useCatches } from "../features/catches/context/useCatches.js";
import { useTrips } from "../features/trips/context/useTrips.js";
import { resolveHomeEntry } from "./homeEntry.js";
import SplashScreen from "./SplashScreen.jsx";
import { isGuestAccessConfirmed } from "../features/auth/data/guestAccess.js";
import { useAuth } from "../features/auth/context/authContextValue.js";
import { canAccessProtectedRoute } from "./routeAccess.js";

function RouteAccessGuard() {
  const auth = useAuth();
  const location = useLocation();
  const publicRoute = location.pathname === "/login" || location.pathname === "/";
  if (publicRoute || canAccessProtectedRoute({ user: auth.user, guestActive: isGuestAccessConfirmed() })) return null;
  return <Navigate to="/login" replace />;
}

const MapPage = lazy(() => import("../pages/MapPage"));
const CalendarPage = lazy(() => import("../pages/JournalCalendarPage"));
const ChallengesPage = lazy(() => import("../pages/ChallengesPage"));
const AchievementsPage = lazy(() => import("../pages/AchievementsPage"));
const LevelsPage = lazy(() => import("../pages/LevelsPage"));
const StreakPage = lazy(() => import("../pages/StreakPage"));
const SpeciesMasteryPage = lazy(() => import("../pages/SpeciesMasteryPage"));
const CatchRewardPage = lazy(() => import("../pages/CatchRewardPage"));
const CatchSharePage = lazy(() => import("../pages/CatchSharePage"));
const FishActivityPage = lazy(() => import("../pages/FishActivityPage"));
const WatersPage = lazy(() => import("../pages/WatersPage"));
const WaterDetailPage = lazy(() => import("../pages/WaterDetailPage"));
const WaterCreatePage = lazy(() => import("../pages/WaterCreatePage"));
const HotspotsPage = lazy(() => import("../pages/HotspotsPage"));
const WaterChatPage = lazy(() => import("../pages/WaterChatPage"));
const CommunityPage = lazy(() => import("../pages/CommunityPage"));
const CommunityCatchDetailPage = lazy(() => import("../pages/CommunityCatchDetailPage"));
const CommunityReportPage = lazy(() => import("../pages/CommunityReportPage"));
const NearbyPage = lazy(() => import("../pages/NearbyPage"));
const CrewPage = lazy(() => import("../pages/CrewPage"));
const PrivacyPage = lazy(() => import("../pages/PrivacyPage"));
const SettingsPage = lazy(() => import("../pages/SettingsPage"));
const NotificationsPage = lazy(() => import("../pages/NotificationsPage"));
const OnboardingPage = lazy(() => import("../pages/OnboardingPage"));
const InsightsPage = lazy(() => import("../pages/InsightsPage"));
const SeasonStoryPage = lazy(() => import("../pages/SeasonStoryPage"));
const YearSummaryPage = lazy(() => import("../pages/YearSummaryPage"));
const SupporterPage = lazy(() => import("../pages/SupporterPage"));
const LoginPage = lazy(() => import("../pages/LoginPage"));

function PageSuspense({ children }) {
  return <Suspense fallback={<Layout><p className="loading-state" role="status">Načítám obrazovku…</p></Layout>}>{children}</Suspense>;
}

function NotFoundPage() {
  return <Layout><section className="add-catch-section"><h1>Stránka nenalezena</h1><p>Požadovaná stránka neexistuje nebo byla přesunuta.</p><Link to="/journal">Zpět do deníku</Link></section></Layout>;
}

function HomeRoute() {
  const auth = useAuth();
  const scope = useDataScope();
  const { state: catchState } = useCatches();
  const { state: tripState } = useTrips();
  const [legacyCheck, setLegacyCheck] = useState({ scopeKey: null, result: null });
  const scopeReady = scope.status === "ready";
  const dataLoaded = !catchState.loading && !tripState.loading;
  const hasLoadedLegacyRecords = catchState.catches.length > 0 || tripState.trips.length > 0;
  const hasReadError = Boolean(catchState.error || tripState.error || scope.status === "error");

  useEffect(() => {
    if (!scopeReady || !dataLoaded || legacyCheck.scopeKey === scope.scopeKey) return;
    let active = true;
    const check = async () => {
      try {
        const hasData = hasLoadedLegacyRecords || await hasLegacyProfileData(scope.scopeKey);
        if (hasData) completeOnboarding(scope.scopeKey);
        if (active) setLegacyCheck({ scopeKey: scope.scopeKey, result: hasData });
      } catch {
        // When detection fails, preserve access to the established Home page.
        if (active) setLegacyCheck({ scopeKey: scope.scopeKey, result: true });
      }
    };
    void check();
    return () => { active = false; };
  }, [dataLoaded, hasLoadedLegacyRecords, legacyCheck.scopeKey, scope.scopeKey, scopeReady]);

  const entry = resolveHomeEntry({
    scopeReady,
    dataLoaded,
    onboardingComplete: scopeReady && isOnboardingComplete(scope.scopeKey),
    hasReadError,
    hasLegacyRecords: hasLoadedLegacyRecords,
    legacyCheckComplete: legacyCheck.scopeKey === scope.scopeKey,
    legacyDataFound: legacyCheck.result,
  });
  if (entry === "home") {
    const hasGuestChoice = isGuestAccessConfirmed();
    if (!auth.user && !hasGuestChoice && legacyCheck.scopeKey === scope.scopeKey) {
      return <Navigate to="/login" replace />;
    }
    return <HomePage />;
  }
  return <Layout><p className="loading-state" role="status">Načítám místní profil…</p></Layout>;
}

function App() {
  const auth = useAuth();
  if (auth.status === "loading") return <SplashScreen />;
  return (
    <>
      <RouteAccessGuard />
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/login" element={<PageSuspense><LoginPage /></PageSuspense>} />
        <Route path="/onboarding" element={<PageSuspense><OnboardingPage /></PageSuspense>} />
        <Route path="/journal" element={<JournalPage />} />
        <Route path="/journal/calendar" element={<PageSuspense><CalendarPage /></PageSuspense>} />
        <Route path="/journal/map" element={<PageSuspense><MapPage /></PageSuspense>} />
        <Route path="/challenges" element={<PageSuspense><ChallengesPage /></PageSuspense>} />
        <Route path="/achievements" element={<PageSuspense><AchievementsPage /></PageSuspense>} />
        <Route path="/levels" element={<PageSuspense><LevelsPage /></PageSuspense>} />
        <Route path="/streak" element={<PageSuspense><StreakPage /></PageSuspense>} />
        <Route path="/fish-activity" element={<PageSuspense><FishActivityPage /></PageSuspense>} />
        <Route path="/species/:speciesKey/mastery" element={<PageSuspense><SpeciesMasteryPage /></PageSuspense>} />
        <Route path="/species/:speciesKey" element={<SpeciesDetailPage />} />
        <Route path="/album" element={<SpeciesAlbumPage />} />
        <Route path="/map" element={<Suspense fallback={<Layout><p className="loading-state" role="status">Načítám mapu…</p></Layout>}><MapPage /></Suspense>} />
        <Route path="/add" element={<AddCatchPage />} />
        <Route path="/catch/:id/reward" element={<PageSuspense><CatchRewardPage /></PageSuspense>} />
        <Route path="/catch/:id/share" element={<PageSuspense><CatchSharePage /></PageSuspense>} />
        <Route path="/catch/:id" element={<CatchDetailPage />} />
        <Route path="/catch/:id/edit" element={<AddCatchPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/privacy" element={<PageSuspense><PrivacyPage /></PageSuspense>} />
        <Route path="/settings" element={<PageSuspense><SettingsPage /></PageSuspense>} />
        <Route path="/notifications" element={<PageSuspense><NotificationsPage /></PageSuspense>} />
        <Route path="/insights" element={<PageSuspense><InsightsPage /></PageSuspense>} />
        <Route path="/season-story" element={<PageSuspense><SeasonStoryPage /></PageSuspense>} />
        <Route path="/year-summary" element={<PageSuspense><YearSummaryPage /></PageSuspense>} />
        <Route path="/supporter" element={<PageSuspense><SupporterPage /></PageSuspense>} />
        <Route path="/trips" element={<TripsPage />} />
        <Route path="/trips/new" element={<TripCreatePage />} />
        <Route path="/trips/:id" element={<TripDetailPage />} />
        <Route path="/trips/:id/edit" element={<TripEditPage />} />
        <Route path="/waters" element={<PageSuspense><WatersPage /></PageSuspense>} />
        <Route path="/waters/new" element={<PageSuspense><WaterCreatePage /></PageSuspense>} />
        <Route path="/waters/:waterId/edit" element={<PageSuspense><WaterCreatePage /></PageSuspense>} />
        <Route path="/waters/:waterId" element={<PageSuspense><WaterDetailPage /></PageSuspense>} />
        <Route path="/waters/:waterId/chat" element={<PageSuspense><WaterChatPage /></PageSuspense>} />
        <Route path="/hotspots" element={<PageSuspense><HotspotsPage /></PageSuspense>} />
        <Route path="/community" element={<PageSuspense><CommunityPage /></PageSuspense>} />
        <Route path="/community/catch/:catchId" element={<PageSuspense><CommunityCatchDetailPage /></PageSuspense>} />
        <Route path="/community/:postId/report" element={<PageSuspense><CommunityReportPage /></PageSuspense>} />
        <Route path="/nearby" element={<PageSuspense><NearbyPage /></PageSuspense>} />
        <Route path="/crew" element={<PageSuspense><CrewPage /></PageSuspense>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

export default App;
