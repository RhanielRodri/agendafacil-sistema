import React, { createContext, useContext } from "react";
import pt from "./pt";

const value = { locale: "pt", t: pt, setLocale: () => {} };

const I18nContext = createContext(value);

export function I18nProvider({ children }) {
  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
