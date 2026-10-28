import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export function CatddScroll({ children }: { children: ReactNode }) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ startY: number; startTop: number } | null>(null);
  const [thumbH, setThumbH] = useState(24);
  const [thumbTop, setThumbTop] = useState(0);
  const [overflow, setOverflow] = useState(false);

  const sync = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 1) {
      setOverflow(false);
      setThumbTop(0);
      return;
    }
    setOverflow(true);
    const h = el.clientHeight;
    const th = Math.max(24, Math.min(h, (h * el.clientHeight) / el.scrollHeight));
    setThumbH(th);
    setThumbTop((el.scrollTop / max) * (h - th));
  }, []);

  useEffect(() => {
    sync();
    const id = window.setTimeout(sync, 30);
    window.addEventListener("resize", sync);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", sync);
    };
  }, [sync, children]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      const el = listRef.current;
      if (!d || !el) return;
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) return;
      const travel = el.clientHeight - thumbH;
      if (travel <= 0) return;
      el.scrollTop = d.startTop + ((e.clientY - d.startY) / travel) * max;
    };
    const onUp = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [thumbH]);

  return (
    <div className="catdd-pop-body">
      <div className="catdd-pop-list" ref={listRef} onScroll={sync}>
        {children}
      </div>
      {overflow && (
        <div
          className="catdd-pop-track"
          onPointerDown={(e) => {
            const el = listRef.current;
            if (!el || (e.target as HTMLElement).closest(".catdd-pop-thumb")) return;
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const ratio = (e.clientY - r.top) / r.height;
            el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
          }}
        >
          <div
            className="catdd-pop-thumb"
            style={{ height: thumbH, marginTop: thumbTop }}
            onPointerDown={(e) => {
              const el = listRef.current;
              if (!el) return;
              e.preventDefault();
              drag.current = { startY: e.clientY, startTop: el.scrollTop };
            }}
          />
        </div>
      )}
    </div>
  );
}
