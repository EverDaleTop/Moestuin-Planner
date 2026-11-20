import { useEffect, useRef, useState } from "react";

type Kind = "error" | "notice";

interface Props {
  kind: Kind;
  message: string | null;
  onClose: () => void;
}

/**
 * Auth-melding als popup. Blijft kort gemount tijdens het sluiten, zodat de
 * uit-transitie ook echt te zien is.
 */
export function AuthToast({ kind, message, onClose }: Props) {
  const open = message !== null && message !== "";
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const lastMessage = useRef(message);
  if (message) lastMessage.current = message;
  const text = message ?? lastMessage.current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    setLeaving(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  if (!mounted || !text) return null;

  return (
    <div
      className={`auth-toast auth-toast-${kind}${leaving ? " is-leaving" : ""}`}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
    >
      <span className="auth-toast-icon" aria-hidden="true">
        <i
          className={`fa-solid ${
            kind === "error" ? "fa-triangle-exclamation" : "fa-circle-info"
          }`}
        />
      </span>
      <span className="auth-toast-text">
        <strong>{kind === "error" ? "Er ging iets mis" : "Melding"}</strong>
        <span>{text}</span>
      </span>
      <button
        type="button"
        className="auth-toast-close"
        onClick={onClose}
        aria-label="Melding sluiten"
      >
        <i className="fa-solid fa-xmark" aria-hidden="true" />
      </button>
    </div>
  );
}
