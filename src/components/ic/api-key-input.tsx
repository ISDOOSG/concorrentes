import { Eye, EyeOff, Clipboard } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
};

export function ApiKeyInput({
  value,
  onChange,
  placeholder,
  disabled,
  autoFocus,
}: Props) {
  const [show, setShow] = useState(false);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        onChange(text.trim());
        toast.success("Colado");
      }
    } catch {
      toast.error("Não consegui ler a área de transferência");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        border: "1px solid var(--via-navy-15)",
        borderRadius: 8,
        background: "var(--via-color-bg-surface, #fff)",
        overflow: "hidden",
      }}
    >
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Cole sua API key"}
        disabled={disabled}
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
        style={{
          flex: 1,
          padding: "10px 12px",
          fontSize: 13,
          fontFamily: "var(--via-font-mono)",
          background: "transparent",
          border: 0,
          outline: "none",
          color: "var(--via-navy)",
        }}
      />
      <button
        type="button"
        onClick={handlePaste}
        disabled={disabled}
        title="Colar"
        style={iconBtn}
      >
        <Clipboard size={14} />
      </button>
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        disabled={disabled}
        title={show ? "Ocultar" : "Mostrar"}
        style={iconBtn}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  background: "var(--via-bg-2, #f5f7fb)",
  borderLeft: "1px solid var(--via-navy-15)",
  color: "var(--via-color-text-muted)",
  cursor: "pointer",
};
