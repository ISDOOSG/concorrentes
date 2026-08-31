import { useEffect, useRef, useState } from "react";
import { LogOut, ChevronDown } from "lucide-react";

type Props = {
  email: string;
  fullName?: string | null;
  onLogout: () => void;
};

export function UserMenu({ email, fullName, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = (fullName || email).slice(0, 1).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="ic-iconbtn"
        onClick={() => setOpen((v) => !v)}
        title="Sua conta"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          width: "auto",
          padding: "0 10px 0 4px",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background:
              "linear-gradient(135deg, var(--via-blue) 0%, #6BA8E0 100%)",
            color: "#fff",
            fontWeight: 900,
            fontSize: 11,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {initials}
        </span>
        <ChevronDown size={14} strokeWidth={1.75} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 240,
            background: "var(--via-color-bg-surface)",
            border: "1px solid var(--via-navy-15)",
            borderRadius: 10,
            boxShadow: "var(--via-shadow-card)",
            padding: 8,
            zIndex: 50,
          }}
        >
          <div
            style={{
              padding: "8px 12px 12px",
              borderBottom: "1px solid var(--via-navy-15)",
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--via-navy)",
              }}
            >
              {fullName || "Sua conta"}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--via-color-text-muted)",
                marginTop: 2,
              }}
            >
              {email}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            role="menuitem"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              width: "100%",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              borderRadius: 6,
              fontSize: 13,
              color: "var(--via-color-text-body)",
              fontFamily: "var(--via-font)",
              textAlign: "left",
              transition: "background var(--via-transition)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--via-bg-2)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            <LogOut size={14} strokeWidth={1.75} />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
