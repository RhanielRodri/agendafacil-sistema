import React from "react";

export default function StateMessage({ type = "empty", title, children }) {
  return (
    <div className={`state ${type}`}>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
