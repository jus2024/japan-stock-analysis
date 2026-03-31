"use client";

import { useState } from "react";

interface StockInputFormProps {
  onSubmit: (query: string) => void;
  disabled: boolean;
}

export default function StockInputForm({ onSubmit, disabled }: StockInputFormProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setQuery("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", gap: "0.5rem" }}
    >
      <label htmlFor="stock-query-input" style={{
        position: "absolute",
        width: "1px",
        height: "1px",
        padding: 0,
        margin: "-1px",
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        borderWidth: 0,
      }}>
        銘柄コードまたは銘柄名
      </label>
      <input
        id="stock-query-input"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled}
        placeholder="銘柄コード（例: 7203）または銘柄名を入力"
        aria-describedby="stock-query-hint"
        style={{
          flex: 1,
          padding: "0.6rem 0.8rem",
          border: "1px solid var(--color-border, #d1d5db)",
          borderRadius: "var(--radius, 0.5rem)",
          fontSize: "0.95rem",
          fontFamily: "inherit",
          backgroundColor: "var(--color-surface, #fff)",
          color: "var(--color-text, #111)",
        }}
      />
      <span id="stock-query-hint" style={{ display: "none" }}>
        4桁の銘柄コードまたは企業名を入力してください
      </span>
      <button
        type="submit"
        disabled={disabled || !query.trim()}
        style={{
          padding: "0.6rem 1.2rem",
          backgroundColor: "var(--color-primary, #2563eb)",
          color: "#fff",
          border: "none",
          borderRadius: "var(--radius, 0.5rem)",
          fontSize: "0.95rem",
          fontFamily: "inherit",
          cursor: disabled || !query.trim() ? "default" : "pointer",
          opacity: disabled || !query.trim() ? 0.5 : 1,
        }}
      >
        分析開始
      </button>
    </form>
  );
}
