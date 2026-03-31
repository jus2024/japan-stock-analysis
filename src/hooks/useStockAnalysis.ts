import { useState, useRef, useCallback, useEffect } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { invokeRuntime } from "@/src/lib/agent/agentRuntime";
import type { StockDataPayload } from "@/src/types/stock";

const STOCK_DATA_START_MARKER = "<!--STOCK_DATA_JSON-->";
const STOCK_DATA_END_MARKER = "<!--/STOCK_DATA_JSON-->";

export interface UseStockAnalysisReturn {
  analysisText: string;
  stockData: StockDataPayload | null;
  isAnalyzing: boolean;
  error: string | null;
  analyze: (query: string) => Promise<void>;
}

/**
 * SSE ストリームのバッファからマーカーで囲まれた JSON を抽出し、
 * テキスト部分と株価データを分離する。
 */
function extractStockData(buffer: string): {
  displayText: string;
  stockData: StockDataPayload | null;
} {
  let displayText = buffer;
  let stockData: StockDataPayload | null = null;

  const startIdx = buffer.indexOf(STOCK_DATA_START_MARKER);
  const endIdx = buffer.indexOf(STOCK_DATA_END_MARKER);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const jsonStr = buffer.slice(
      startIdx + STOCK_DATA_START_MARKER.length,
      endIdx,
    );

    try {
      stockData = JSON.parse(jsonStr) as StockDataPayload;
    } catch {
      // JSON パース失敗時はスキップ（テキスト分析のみ表示）
    }

    // マーカー＋JSON 部分を表示テキストから除去
    displayText =
      buffer.slice(0, startIdx) +
      buffer.slice(endIdx + STOCK_DATA_END_MARKER.length);
  }

  return { displayText, stockData };
}

/**
 * 株式分析専用のカスタムフック。
 *
 * AgentCore Runtime と SSE 通信し、ストリーム内の JSON マーカーを検出して
 * テキスト（analysisText）と株価データ（stockData）を分離する。
 *
 * @param runtimeArn - AgentCore Runtime の ARN（未設定時は送信不可）
 */
export function useStockAnalysis(
  runtimeArn: string | undefined,
): UseStockAnalysisReturn {
  const [analysisText, setAnalysisText] = useState("");
  const [stockData, setStockData] = useState<StockDataPayload | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
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

  const analyze = useCallback(
    async (query: string) => {
      if (!runtimeArn) return;

      // 状態をリセット
      setError(null);
      setAnalysisText("");
      setStockData(null);
      setIsAnalyzing(true);

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
        setIsAnalyzing(false);
        return;
      }

      // 進行中リクエストをキャンセルして新しい AbortController を作成
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // チャンクを蓄積するバッファ
      let rawBuffer = "";

      await invokeRuntime({
        runtimeArn,
        accessToken,
        sessionId: sessionIdRef.current,
        prompt: query,
        signal: abortController.signal,
        onChunk: (chunk: string) => {
          rawBuffer += chunk;
          const { displayText, stockData: parsed } =
            extractStockData(rawBuffer);
          setAnalysisText(displayText);
          if (parsed) {
            setStockData(parsed);
          }
        },
        onError: (errorMsg: string) => {
          setError(errorMsg);
          setIsAnalyzing(false);
          abortControllerRef.current = null;
        },
        onComplete: () => {
          setIsAnalyzing(false);
          abortControllerRef.current = null;
        },
      });
    },
    [runtimeArn],
  );

  return { analysisText, stockData, isAnalyzing, error, analyze };
}
