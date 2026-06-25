import React from "react";
import { useTranslation } from "../i18n/I18nContext.jsx";

export default function StateMessage({ type = "empty", title, children, onRetry }) {
  const { t } = useTranslation();

  return (
    <div className={`state ${type}`}>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {onRetry && (
        <button className="retry-button" type="button" onClick={onRetry}>
          {t.retry}
        </button>
      )}
    </div>
  );
}
