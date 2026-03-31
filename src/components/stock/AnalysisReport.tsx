"use client";

interface AnalysisReportProps {
  content: string;
  isStreaming: boolean;
}

export default function AnalysisReport({ content, isStreaming }: AnalysisReportProps) {
  return (
    <section aria-label="分析レポート" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          padding: "1rem",
          border: "1px solid var(--color-border, #e0e0e0)",
          borderRadius: "var(--radius, 8px)",
          backgroundColor: "var(--color-surface, #fff)",
          color: "var(--color-text, #1a1a2e)",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
          fontSize: "0.95rem",
          lineHeight: 1.7,
          minHeight: "4rem",
        }}
      >
        {content || (isStreaming ? "" : "分析結果がここに表示されます。")}
        {isStreaming && (
          <span
            aria-label="ストリーミング中"
            style={{
              display: "inline-block",
              width: "0.5em",
              height: "1em",
              marginLeft: "2px",
              backgroundColor: "var(--color-primary, #0073bb)",
              animation: "blink 1s step-end infinite",
              verticalAlign: "text-bottom",
            }}
          />
        )}
      </div>

      <p
        style={{
          fontSize: "0.8rem",
          color: "var(--color-text-secondary, #555)",
          padding: "0.6rem 0.8rem",
          border: "1px solid var(--color-border, #e0e0e0)",
          borderRadius: "var(--radius, 8px)",
          backgroundColor: "var(--color-surface, #fff)",
          lineHeight: 1.5,
        }}
      >
        ⚠ 本分析レポートは情報提供を目的としたものであり、投資助言には該当しません。投資判断はご自身の責任において行ってください。
      </p>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </section>
  );
}
