import React from "react";

export default function StateMessage({ type = "empty", title, children, onRetry }) {
  return (
    <div className={`state ${type}`}>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {onRetry && (
        <button className="retry-button" type="button" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}
