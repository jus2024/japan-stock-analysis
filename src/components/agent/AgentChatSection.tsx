"use client";

import { useAgentChat } from "@/src/hooks/useAgentChat";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";

interface AgentChatSectionProps {
  runtimeArn: string | undefined;
}

/**
 * エージェントチャット UI セクション。
 * AgentCore Runtime との HTTP SSE 通信によるサンプル対話 UI を提供する。
 */
export default function AgentChatSection({ runtimeArn }: AgentChatSectionProps) {
  const { messages, isLoading, error, sendMessage } = useAgentChat(runtimeArn);

  const isRuntimeConfigured = !!runtimeArn?.trim();

  return (
    <section
      style={{
        marginTop: "3rem",
        paddingTop: "2rem",
        borderTop: "1px solid var(--color-border, #e5e7eb)",
      }}
    >
      <h2
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          marginBottom: "0.5rem",
        }}
      >
        サンプル: エージェントチャット
      </h2>
      <p
        style={{
          color: "var(--color-text-secondary, #6b7280)",
          marginBottom: "2rem",
          lineHeight: 1.6,
        }}
      >
        AgentCore Runtime との連携サンプルです。HTTP SSE
        経由でエージェントと対話できます。
      </p>

      {!isRuntimeConfigured && (
        <div
          role="status"
          style={{
            backgroundColor: "#eff6ff",
            border: "1px solid #93c5fd",
            color: "#1e40af",
            borderRadius: "var(--radius, 0.5rem)",
            padding: "0.75rem 1rem",
            marginBottom: "1.5rem",
            fontSize: "0.9rem",
          }}
        >
          AgentCore Runtime
          が設定されていません。NEXT_PUBLIC_AGENTCORE_RUNTIME_ARN
          を設定してください。
        </div>
      )}

      <MessageList messages={messages} />

      {error && (
        <div
          role="alert"
          style={{
            backgroundColor: "#fef2f2",
            border: "1px solid #fca5a5",
            color: "#991b1b",
            borderRadius: "var(--radius, 0.5rem)",
            padding: "0.75rem 1rem",
            marginTop: "0.75rem",
            marginBottom: "1rem",
            fontSize: "0.9rem",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginTop: "0.75rem" }}>
        <MessageInput
          onSend={sendMessage}
          disabled={isLoading || !isRuntimeConfigured}
        />
      </div>
    </section>
  );
}