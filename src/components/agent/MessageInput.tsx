"use client";

import { useState } from "react";

interface MessageInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export default function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", gap: "0.5rem" }}
    >
      <label htmlFor="agent-message-input" style={{
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
        メッセージ入力
      </label>
      <input
        id="agent-message-input"
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        placeholder="メッセージを入力..."
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
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        style={{
          padding: "0.6rem 1.2rem",
          backgroundColor: "var(--color-primary, #2563eb)",
          color: "#fff",
          border: "none",
          borderRadius: "var(--radius, 0.5rem)",
          fontSize: "0.95rem",
          fontFamily: "inherit",
          cursor: disabled || !text.trim() ? "default" : "pointer",
          opacity: disabled || !text.trim() ? 0.5 : 1,
        }}
      >
        送信
      </button>
    </form>
  );
}