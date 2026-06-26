import React, { createContext, useContext, useState } from "react";
import pt from "./pt";
import en from "./en";

const messages = { pt, en };
const STORAGE_KEY = "agendafacil_locale";

function detectLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "pt" || stored === "en") return stored;
  } catch (_) {}
  const lang = navigator.language || "pt";
  return lang.startsWith("pt") ? "pt" : "en";
}

const I18nContext = createContext({ locale: "pt", t: pt, setLocale: () => {} });

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(detectLocale);

  function setLocale(next) {
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
    setLocaleState(next);
  }

  const t = messages[locale] ?? messages.pt;

  return (
    <I18nContext.Provider value={{ locale, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
