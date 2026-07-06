import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import "./styles/tokens.css";
import "./styles/theme.css";
import "./index.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/login" element={<App />} />
        <Route path="/register" element={<App />} />
        <Route path="/workspaces/:workspacePublicId/workbooks/:workbookPublicId/sessions/:sessionPublicId" element={<App />} />
        <Route path="/workspaces/:workspacePublicId/workbooks/:workbookPublicId" element={<App />} />
        <Route path="/workspaces/:workspacePublicId" element={<App />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>
);