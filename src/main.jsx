import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./app/App.jsx";
import AppErrorBoundary from "./app/AppErrorBoundary.jsx";
import { CatchProvider } from "./features/catches/context/CatchContext.jsx";
import { TripProvider } from "./features/trips/context/TripContext.jsx";
import { AuthProvider } from "./features/auth/context/AuthContext.jsx";
import { DataScopeProvider } from "./features/auth/context/DataScopeContext.jsx";
import { SyncProvider } from "./features/sync/context/SyncContext.jsx";
import { ProgressionProvider } from "./features/progression/context/ProgressionContext.jsx";
import { configurePhotoCloudProvider } from "./features/catches/data/photoCloudProvider.js";
import { cloudinaryPhotoProvider } from "./features/catches/data/cloudinaryPhotoProvider.js";
import { NotificationProvider } from "./features/notifications/context/NotificationProvider.jsx";
import { Capacitor } from "@capacitor/core";
import NavigationMemoryProvider from "./shared/layout/NavigationMemoryProvider.jsx";

// Production builds may use Cloudinary only when the server-side capability endpoint enables it.
if (import.meta.env.PROD) configurePhotoCloudProvider(cloudinaryPhotoProvider);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppErrorBoundary>
       <AuthProvider>
        <DataScopeProvider>
          <SyncProvider>
            <CatchProvider>
              <TripProvider>
                <ProgressionProvider>
                  <NotificationProvider>
                    <NavigationMemoryProvider><App /></NavigationMemoryProvider>
                  </NotificationProvider>
                </ProgressionProvider>
              </TripProvider>
            </CatchProvider>
          </SyncProvider>
        </DataScopeProvider>
       </AuthProvider>
      </AppErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);

if (import.meta.env.PROD && !Capacitor.isNativePlatform() && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
    // Offline installation is an enhancement; local IndexedDB data and the
    // running application remain usable if registration is unavailable.
  });
}
