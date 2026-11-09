import { useEffect, useRef, type RefObject } from "react";

/** Dismiss menus before global shortcuts run; support the desktop menu keys. */
export function usePopup(box: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const items = () => Array.from(box.current?.querySelectorAll<HTMLButtonElement>('[role="menu"] button:not(:disabled), [role="listbox"] button:not(:disabled)') ?? []);
    const frame = requestAnimationFrame(() => items()[0]?.focus());
    const pointer = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) closeRef.current(); };
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation(); closeRef.current(); previous?.focus(); return;
      }
      const list = items();
      const index = list.indexOf(document.activeElement as HTMLButtonElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) && list.length) {
        e.preventDefault(); e.stopPropagation();
        const next = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : (index + (e.key === "ArrowUp" ? -1 : 1) + list.length) % list.length;
        list[next]?.focus();
      } else if (/^[1-9]$/.test(e.key) && list[Number(e.key) - 1]) {
        e.preventDefault(); e.stopPropagation(); list[Number(e.key) - 1].click();
      } else if (e.key === "Tab") closeRef.current();
    };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", keyboard, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", keyboard, true);
      if (document.activeElement === document.body && previous?.isConnected) previous.focus();
    };
  }, [box, open]);
}
