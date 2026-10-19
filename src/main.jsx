import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./app/App.jsx";
import { CatchProvider } from "./features/catches/context/CatchContext.jsx";
import { TripProvider } from "./features/trips/context/TripContext.jsx";
import { AuthProvider } from "./features/auth/context/AuthContext.jsx";
import { DataScopeProvider } from "./features/auth/context/DataScopeContext.jsx";
import { SyncProvider } from "./features/sync/context/SyncContext.jsx";
import { ProgressionProvider } from "./features/progression/context/ProgressionContext.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <DataScopeProvider>
          <SyncProvider>
            <CatchProvider>
              <TripProvider>
                <ProgressionProvider>
                  <App />
                </ProgressionProvider>
              </TripProvider>
            </CatchProvider>
          </SyncProvider>
        </DataScopeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline installation is an enhancement; local IndexedDB data and the
      // running application remain usable if registration is unavailable.
    });
  });
}
