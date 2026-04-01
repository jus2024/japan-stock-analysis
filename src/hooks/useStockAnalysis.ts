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
  isLoadingChart: boolean;
  error: string | null;
  analyze: (query: string) => Promise<void>;
}

/**
 * SSE ストリームのバッファからマーカーで囲まれた JSON を抽出し、
 * テキスト部分と株価データを分離する。
 *
 * ストリーミング途中（開始マーカーはあるが終了マーカーがまだない）の場合、
 * マーカー以降のテキストを非表示にし、代わりにプレースホルダーを表示する。
 */
function extractStockData(buffer: string): {
  displayText: string;
  stockData: StockDataPayload | null;
  isLoadingChart: boolean;
} {
  let displayText = buffer;
  let stockData: StockDataPayload | null = null;
  let isLoadingChart = false;

  const startIdx = buffer.indexOf(STOCK_DATA_START_MARKER);
  const endIdx = buffer.indexOf(STOCK_DATA_END_MARKER);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // 完了: マーカー＋JSON を除去してパース
    const jsonStr = buffer.slice(
      startIdx + STOCK_DATA_START_MARKER.length,
      endIdx,
    );

    try {
      stockData = JSON.parse(jsonStr) as StockDataPayload;
    } catch {
      // JSON パース失敗時はスキップ
    }

    displayText =
      buffer.slice(0, startIdx) +
      buffer.slice(endIdx + STOCK_DATA_END_MARKER.length);
  } else if (startIdx !== -1 && endIdx === -1) {
    // 途中: 開始マーカーはあるが終了マーカーがまだ来ていない
    // マーカー以降を非表示にする
    displayText = buffer.slice(0, startIdx);
    isLoadingChart = true;
  }

  return { displayText, stockData, isLoadingChart };
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
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const stockDataRef = useRef<StockDataPayload | null>(null);

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
      stockDataRef.current = null;
      setIsAnalyzing(true);
      setIsLoadingChart(false);

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
          const { displayText, stockData: parsed, isLoadingChart: loading } =
            extractStockData(rawBuffer);
          setAnalysisText(displayText);
          setIsLoadingChart(loading);
          if (parsed) {
            setStockData(parsed);
            stockDataRef.current = parsed;
            setIsLoadingChart(false);
          }
        },
        onError: (errorMsg: string) => {
          setError(errorMsg);
          setIsAnalyzing(false);
          setIsLoadingChart(false);
          abortControllerRef.current = null;
        },
        onComplete: () => {
          // 最終パース試行
          if (!stockDataRef.current) {
            const { stockData: finalParsed } = extractStockData(rawBuffer);
            if (finalParsed) {
              setStockData(finalParsed);
            }
          }
          setIsAnalyzing(false);
          setIsLoadingChart(false);
          abortControllerRef.current = null;
        },
      });
    },
    [runtimeArn],
  );

  return { analysisText, stockData, isAnalyzing, isLoadingChart, error, analyze };
}
