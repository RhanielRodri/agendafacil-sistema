import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { I18nProvider } from "./i18n/I18nContext.jsx";
import tenant, { isPlatformLanding } from "./config/tenant.js";
import "./styles.css";

document.documentElement.dataset.demo = isPlatformLanding ? "platform" : tenant.slug;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
