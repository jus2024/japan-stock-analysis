"use client";

import StockInputForm from "@/src/components/stock/StockInputForm";
import AnalysisReport from "@/src/components/stock/AnalysisReport";
import StockChart from "@/src/components/stock/StockChart";
import { useStockAnalysis } from "@/src/hooks/useStockAnalysis";
import styles from "./page.module.css";

const runtimeArn = process.env.NEXT_PUBLIC_JP_STOCK_AGENT_RUNTIME_ARN;

export default function Home() {
  const { analysisText, stockData, isAnalyzing, isLoadingChart, error, analyze } =
    useStockAnalysis(runtimeArn);

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>日本株分析</h1>
      <p className={styles.description}>
        銘柄コードまたは銘柄名を入力すると、AIエージェントが多角的に分析します。
      </p>

      {!runtimeArn && (
        <div role="alert" className={styles.setupWarning}>
          <strong>セットアップが必要です</strong>
          <br />
          環境変数 <code>NEXT_PUBLIC_JP_STOCK_AGENT_RUNTIME_ARN</code> に
          AgentCore Runtime の ARN を設定してください。
          詳細は <code>.env.example</code> を参照してください。
        </div>
      )}

      <StockInputForm onSubmit={analyze} disabled={isAnalyzing || !runtimeArn} />

      {isAnalyzing && (
        <div role="status" aria-label="分析中" className={styles.loadingIndicator}>
          <span className={styles.spinner} />
          分析中です…
        </div>
      )}

      {error && (
        <div role="alert" className={styles.errorBox}>
          {error}
          <br />
          <span className={styles.errorHint}>
            入力内容を確認して、もう一度お試しください。
          </span>
        </div>
      )}

      {stockData && (
        <div className={styles.stockInfo}>
          <strong>{stockData.company_name}</strong>（{stockData.ticker_code}）
        </div>
      )}

      {isLoadingChart && !stockData && (
        <div className={styles.section}>
          <div className={styles.chartLoading}>
            <span className={styles.spinner} />
            株価チャートを描画中…
          </div>
        </div>
      )}

      {stockData && stockData.prices.length > 0 && (
        <div className={styles.section}>
          <StockChart data={stockData.prices} />
        </div>
      )}

      {(analysisText || isAnalyzing) && (
        <div className={styles.section}>
          <AnalysisReport content={analysisText} isStreaming={isAnalyzing} />
        </div>
      )}
    </main>
  );
}
