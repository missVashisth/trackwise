import { createContext, useContext, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn.js";

const PopoverContext = createContext({ close: () => {} });

/**
 * Click-to-open floating panel. `trigger` receives props to spread on any
 * button. Children may call usePopoverClose() to dismiss (see MenuItem).
 */
function Popover({ trigger, children, align = "end", width = "w-56", className }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointer(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function handleKey(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative inline-flex">
      {trigger({
        onClick: () => setOpen((value) => !value),
        "aria-expanded": open,
        "aria-haspopup": "true",
        active: open,
      })}
      {open && (
        <PopoverContext.Provider value={{ close }}>
          <div
            className={cn(
              "absolute top-full z-40 mt-1.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg",
              align === "end" ? "right-0" : "left-0",
              width,
              className,
            )}
          >
            {children}
          </div>
        </PopoverContext.Provider>
      )}
    </div>
  );
}

export function usePopoverClose() {
  return useContext(PopoverContext).close;
}

export function MenuItem({ icon: Icon, children, onSelect, tone = "default", disabled }) {
  const close = usePopoverClose();

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        onSelect?.();
        close();
      }}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition disabled:opacity-50",
        tone === "danger"
          ? "text-red-600 hover:bg-red-50"
          : "text-slate-700 hover:bg-slate-100",
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function MenuDivider() {
  return <div className="my-1 h-px bg-slate-100" />;
}

export default Popover;
