import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import { CatchProvider } from "./context/CatchContext.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <CatchProvider>
        <App />
      </CatchProvider>
    </BrowserRouter>
  </StrictMode>,
);
