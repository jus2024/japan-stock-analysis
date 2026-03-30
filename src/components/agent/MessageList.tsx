"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/src/types";

interface MessageListProps {
  messages: ChatMessage[];
}

export default function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div
      role="log"
      aria-live="polite"
      style={{
        overflowY: "auto",
        maxHeight: "400px",
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      {messages.length === 0 && (
        <p style={{ color: "var(--color-text-secondary, #6b7280)", fontSize: "0.9rem" }}>
          メッセージはまだありません。
        </p>
      )}
      {messages.map((msg) => (
        <div
          key={msg.id}
          style={{
            display: "flex",
            justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
          }}
        >
          <div
            style={{
              maxWidth: "75%",
              padding: "0.6rem 1rem",
              borderRadius: "0.75rem",
              fontSize: "0.95rem",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              backgroundColor: msg.role === "user" ? "#e0f2fe" : "#f3f4f6",
              color: msg.role === "user" ? "#0c4a6e" : "#1f2937",
            }}
          >
            {msg.content}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}