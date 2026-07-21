import { useCallback, useEffect, useState } from "react";

// Estados padrão dos módulos do painel: loading, ready, error e expired.
// Erro nunca exige reload total — reload() refaz apenas esta consulta.
export function usePanelData(loader, deps, onSessionExpired) {
  const [state, setState] = useState("loading");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const run = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      setData(await loader());
      setState("ready");
    } catch (failure) {
      if (failure.status === 401) {
        setState("expired");
        onSessionExpired?.();
        return;
      }
      setError(failure.message || "Erro inesperado");
      setState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  return { state, data, error, reload: run, setData };
}
