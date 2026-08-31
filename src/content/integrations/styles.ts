import type { CSSProperties } from "react";

export const link: CSSProperties = {
  color: "var(--via-blue)",
  fontWeight: 700,
  textDecoration: "underline",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

export const heading: CSSProperties = {
  fontSize: 14,
  fontWeight: 900,
  color: "var(--via-navy)",
  marginBottom: 6,
};

export const paragraph: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.55,
  color: "var(--via-color-text)",
  margin: 0,
};

export const list: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.7,
  color: "var(--via-color-text)",
  paddingLeft: 18,
  margin: 0,
};

export const optionBox = (color = "var(--via-navy-15)"): CSSProperties => ({
  border: `1px solid ${color}`,
  borderRadius: 10,
  padding: 14,
  background: "var(--via-bg-2, #f5f7fb)",
});

export const optionHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 10,
};

export const optionBadge = (color: string): CSSProperties => ({
  fontSize: 10,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "#fff",
  background: color,
  borderRadius: 999,
  padding: "3px 8px",
});

export const optionTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "var(--via-navy)",
  margin: 0,
};

export const code: CSSProperties = {
  fontFamily: "var(--via-font-mono)",
  fontSize: 12,
  background: "var(--via-navy-15, rgba(0,0,0,0.08))",
  padding: "1px 6px",
  borderRadius: 4,
};

export const pricingBox: CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.6,
  color: "var(--via-color-text)",
  background: "var(--via-bg-2, #f5f7fb)",
  border: "1px dashed var(--via-navy-15)",
  borderRadius: 10,
  padding: 12,
};
