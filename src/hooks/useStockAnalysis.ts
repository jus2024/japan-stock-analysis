import { useState, useRef, useCallback, useEffect } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { invokeRuntime } from "@/src/lib/agent/agentRuntime";
import type { StockDataPayload } from "@/src/types/stock";

const STOCK_DATA_START_MARKER = "<!--STOCK_DATA_JSON-->";
const STOCK_DATA_END_MARKER = "<!--/STOCK_DATA_JSON-->";

/** データソースの種別 */
type StockDataSource = "graphql" | "sse" | null;

export interface UseStockAnalysisReturn {
  analysisText: string;
  stockData: StockDataPayload | null;
  isAnalyzing: boolean;
  isLoadingChart: boolean;
  error: string | null;
  analyze: (query: string) => Promise<void>;
}

/**
 * GraphQL側とSSE側の両方から株価データが取得された場合のデータソース優先ロジック。
 * GraphQL側のデータが存在する場合、GraphQL側を優先する。
 *
 * Property 2 のテスト用にエクスポートする。
 */
export function resolveStockDataSource(
  graphqlData: StockDataPayload | null,
  sseData: StockDataPayload | null,
): { data: StockDataPayload | null; source: StockDataSource } {
  if (graphqlData) {
    return { data: graphqlData, source: "graphql" };
  }
  if (sseData) {
    return { data: sseData, source: "sse" };
  }
  return { data: null, source: null };
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
 * クエリ文字列から銘柄コード（4桁数字）を抽出する。
 * 銘柄コードが見つからない場合は null を返す。
 */
export function extractTickerCode(query: string): string | null {
  const match = query.match(/\b(\d{4})\b/);
  return match ? match[1] : null;
}

/**
 * 株式分析専用のカスタムフック。
 *
 * Amplify GraphQL API（getStockPrices）と AgentCore Runtime SSE 通信を
 * 並行実行し、チャートデータを高速に取得する。
 * GraphQL側が成功すれば即座にチャートを描画し、失敗時はSSEマーカーにフォールバックする。
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
  const stockDataSourceRef = useRef<StockDataSource>(null);

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
      stockDataSourceRef.current = null;
      setIsAnalyzing(true);
      setIsLoadingChart(true); // Task 4.1: 分析開始時にisLoadingChart=true

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
        setIsLoadingChart(false);
        return;
      }

      // 進行中リクエストをキャンセルして新しい AbortController を作成
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Task 3.1: GraphQL クエリの準備
      const tickerCode = extractTickerCode(query);

      // Task 3.2: GraphQL クエリと SSE 通信を並行実行
      const graphqlPromise = (async () => {
        if (!tickerCode) return; // 銘柄コードが抽出できない場合はスキップ
        try {
          const client = generateClient<Schema>();
          const result = await client.queries.getStockPrices(
            { tickerCode },
            { authMode: "userPool" },
          );
          if (result.data) {
            const parsed = JSON.parse(result.data) as StockDataPayload & { error?: string };
            if (!parsed.error) {
              // Task 3.4: GraphQL側のデータが存在する場合、即座にセット
              const resolved = resolveStockDataSource(parsed, stockDataRef.current);
              if (resolved.source === "graphql") {
                setStockData(parsed);
                stockDataRef.current = parsed;
                stockDataSourceRef.current = "graphql";
                setIsLoadingChart(false); // Task 4.1: GraphQLデータ到着時にfalse
              }
            }
          }
        } catch {
          // Task 3.3: GraphQL失敗時はSSEフォールバックに任せる
          // isLoadingChart は true のまま継続（Task 4.1）
        }
      })();

      // チャンクを蓄積するバッファ
      let rawBuffer = "";

      const ssePromise = invokeRuntime({
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

          if (parsed) {
            // Task 3.3 & 3.4: SSEマーカーからデータが取得された場合、
            // GraphQL側のデータが既に存在するなら無視する
            if (stockDataSourceRef.current !== "graphql") {
              setStockData(parsed);
              stockDataRef.current = parsed;
              stockDataSourceRef.current = "sse";
              setIsLoadingChart(false);
            }
          } else if (loading && stockDataSourceRef.current !== "graphql") {
            // SSEマーカー途中でGraphQLデータがまだない場合のみローディング継続
            setIsLoadingChart(true);
          }
        },
        onError: (errorMsg: string) => {
          setError(errorMsg);
          setIsAnalyzing(false);
          // Task 4.1: エラー時はローディング終了（GraphQLデータがあればそのまま）
          if (stockDataSourceRef.current !== "graphql") {
            setIsLoadingChart(false);
          }
          abortControllerRef.current = null;
        },
        onComplete: () => {
          // 最終パース試行（SSEフォールバック）
          if (!stockDataRef.current) {
            const { stockData: finalParsed } = extractStockData(rawBuffer);
            if (finalParsed) {
              setStockData(finalParsed);
              stockDataRef.current = finalParsed;
              stockDataSourceRef.current = "sse";
            }
          }
          setIsAnalyzing(false);
          // Task 4.1: 全ソース失敗時にfalse（GraphQLデータがあれば既にfalse）
          if (stockDataSourceRef.current !== "graphql") {
            setIsLoadingChart(false);
          }
          abortControllerRef.current = null;
        },
      });

      // 両方の完了を待つ（GraphQLは先に完了する想定）
      await Promise.allSettled([graphqlPromise, ssePromise]);
    },
    [runtimeArn],
  );

  return { analysisText, stockData, isAnalyzing, isLoadingChart, error, analyze };
}
