"use client";

import ReactMarkdown from "react-markdown";

interface AnalysisReportProps {
  content: string;
  isStreaming: boolean;
}

export default function AnalysisReport({
  content,
  isStreaming,
}: AnalysisReportProps) {
  return (
    <section
      aria-label="分析レポート"
      style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
    >
      <div
        style={{
          padding: "1rem 1.2rem",
          border: "1px solid var(--color-border, #e0e0e0)",
          borderRadius: "var(--radius, 8px)",
          backgroundColor: "var(--color-surface, #fff)",
          color: "var(--color-text, #1a1a2e)",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
          fontSize: "0.95rem",
          lineHeight: 1.7,
          minHeight: "4rem",
          overflowWrap: "break-word",
        }}
        className="analysis-markdown"
      >
        {content ? (
          <ReactMarkdown>{content}</ReactMarkdown>
        ) : (
          !isStreaming && (
            <p style={{ color: "var(--color-text-secondary, #888)" }}>
              分析結果がここに表示されます。
            </p>
          )
        )}
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
        ⚠
        本分析レポートは情報提供を目的としたものであり、投資助言には該当しません。投資判断はご自身の責任において行ってください。
      </p>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .analysis-markdown h1,
        .analysis-markdown h2,
        .analysis-markdown h3,
        .analysis-markdown h4 {
          margin-top: 1.2em;
          margin-bottom: 0.4em;
        }
        .analysis-markdown h3 { font-size: 1.15rem; }
        .analysis-markdown h4 { font-size: 1.05rem; }
        .analysis-markdown ul, .analysis-markdown ol {
          padding-left: 1.5em;
          margin: 0.4em 0;
        }
        .analysis-markdown li { margin: 0.2em 0; }
        .analysis-markdown p { margin: 0.4em 0; }
        .analysis-markdown hr {
          border: none;
          border-top: 1px solid var(--color-border, #e0e0e0);
          margin: 1em 0;
        }
        .analysis-markdown table {
          border-collapse: collapse;
          width: 100%;
          margin: 0.5em 0;
          font-size: 0.9rem;
        }
        .analysis-markdown th,
        .analysis-markdown td {
          border: 1px solid var(--color-border, #e0e0e0);
          padding: 0.4em 0.6em;
          text-align: left;
        }
        .analysis-markdown th {
          background-color: var(--color-surface, #f5f5f5);
          font-weight: 600;
        }
        .analysis-markdown strong { font-weight: 600; }
      `}</style>
    </section>
  );
}
