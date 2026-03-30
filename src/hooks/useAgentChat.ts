import { useState, useRef, useCallback, useEffect } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { invokeRuntime } from "@/src/lib/agent/agentRuntime";
import type { ChatMessage } from "@/src/types";

export interface UseAgentChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
}

/**
 * AgentCore Runtime との HTTP SSE 通信とメッセージ状態を管理するカスタムフック。
 *
 * @param runtimeArn - AgentCore Runtime の ARN（未設定時は送信不可）
 */
export function useAgentChat(
  runtimeArn: string | undefined,
): UseAgentChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  // コンポーネントアンマウント時に進行中リクエストをキャンセル
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!runtimeArn) return;

      // エラー状態をクリア
      setError(null);

      // ユーザーメッセージを追加
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      // JWT トークン取得
      let accessToken: string;
      try {
        const session = await fetchAuthSession();
        const token = session.tokens?.accessToken?.toString();
        if (!token) {
          throw new Error("No access token");
        }
        accessToken = token;
      } catch {
        setError(
          "認証情報を取得できません。ログイン状態を確認してください。",
        );
        setIsLoading(false);
        return;
      }

      // アシスタントメッセージ ID を事前生成
      const assistantId = crypto.randomUUID();
      let isFirstChunk = true;

      // 進行中リクエストをキャンセルして新しい AbortController を作成
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      await invokeRuntime({
        runtimeArn,
        accessToken,
        sessionId: sessionIdRef.current,
        prompt: text,
        signal: abortController.signal,
        onChunk: (chunk: string) => {
          if (isFirstChunk) {
            const assistantMessage: ChatMessage = {
              id: assistantId,
              role: "assistant",
              content: chunk,
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, assistantMessage]);
            isFirstChunk = false;
          } else {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, content: msg.content + chunk }
                  : msg,
              ),
            );
          }
        },
        onError: (errorMsg: string) => {
          setError(errorMsg);
          setIsLoading(false);
          abortControllerRef.current = null;
        },
        onComplete: () => {
          setIsLoading(false);
          abortControllerRef.current = null;
        },
      });
    },
    [runtimeArn],
  );

  return { messages, isLoading, error, sendMessage };
}