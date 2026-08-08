import { useEffect, useState } from "react";
import type { Garden } from "./types";
import { api } from "./api";

interface Props {
  gardenId: string;
  token: string;
  onJoined: (garden: Garden) => void;
  onCancel: () => void;
}

export function InviteScreen({ gardenId, token, onJoined, onCancel }: Props) {
  const [info, setInfo] = useState<{ name: string; ownerName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getInvite(gardenId, token)
      .then((res) => {
        if (!cancelled) setInfo(res.garden);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message ?? "Uitnodiging ophalen mislukt.");
      });
    return () => {
      cancelled = true;
    };
  }, [gardenId, token]);

  const join = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const garden = await api.joinGarden(gardenId, token);
      onJoined(garden);
    } catch (err: any) {
      setError(err.message ?? "Deelnemen mislukt.");
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>🥕 Uitnodiging</h1>
        {error ? (
          <>
            <p className="auth-sub">{error}</p>
            <button className="btn-ghost" onClick={onCancel}>
              Terug naar mijn tuinen
            </button>
          </>
        ) : !info ? (
          <p className="auth-sub">Uitnodiging ophalen…</p>
        ) : (
          <>
            <p className="auth-sub">
              Je bent uitgenodigd om mee te werken aan de tuin{" "}
              <strong>“{info.name}”</strong> van <strong>{info.ownerName}</strong>.
              Door deel te nemen kun je eraan meewerken.
            </p>
            <button className="btn-primary btn-block" onClick={() => void join()} disabled={busy}>
              {busy ? "Deelnemen…" : "Deelnemen aan deze tuin"}
            </button>
            <button className="btn-ghost btn-block auth-cancel" onClick={onCancel}>
              Later
            </button>
          </>
        )}
      </div>
    </div>
  );
}
