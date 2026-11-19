import { useEffect, useState } from "react";

/** Kleine, niet-blokkerende melding als de browser offline is. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="net-banner" role="status" aria-live="polite">
      <i className="fa-solid fa-wifi" aria-hidden="true" />
      Geen internetverbinding — sommige onderdelen werken tijdelijk niet.
    </div>
  );
}
