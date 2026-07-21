import { useState } from "react";

// Ação estrutural com três desfechos possíveis: sucesso, erro comum e conflito
// com agendamento futuro. O conflito não é erro — é uma decisão pendente, e por
// isso volta para a tela em vez de virar mensagem vermelha.
export function useStructuralAction({ onSessionExpired, reload } = {}) {
  const [message, setMessage] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [busy, setBusy] = useState(false);

  async function attempt(action, successText, confirm) {
    setBusy(true);
    try {
      const result = await action(confirm);
      const applied = result?.appliedImpact?.length || 0;
      setConflict(null);
      setMessage({
        type: "success",
        text: applied
          ? `${successText} ${applied} agendamento(s) seguem fora da nova configuração e continuam ativos.`
          : successText
      });
      await reload?.();
      return true;
    } catch (failure) {
      if (failure.status === 401) {
        onSessionExpired?.();
        return false;
      }
      if (failure.code === "CONFLICT_REQUIRES_CONFIRMATION" && !confirm) {
        setConflict({
          title: failure.message,
          conflicts: failure.conflicts || [],
          confirm: () => attempt(action, successText, true)
        });
        return false;
      }
      setConflict(null);
      setMessage({ type: "error", text: failure.message });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    message,
    conflict,
    busy,
    setMessage,
    dismissConflict: () => setConflict(null),
    run: (action, successText) => attempt(action, successText, false)
  };
}
