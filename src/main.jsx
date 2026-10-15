import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import IncidentPage from "./IncidentPage.jsx";
import MatchIncidentPage from "./MatchIncidentPage.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {window.location.pathname === "/incident/match-isolation" ? <MatchIncidentPage /> : window.location.pathname === "/incident" ? <IncidentPage /> : <App />}
  </React.StrictMode>,
);
