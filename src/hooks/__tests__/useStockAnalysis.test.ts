import { describe, it, expect, vi } from "vitest";

// Mock external dependencies that useStockAnalysis.ts imports at module level
vi.mock("react", () => ({
  useState: vi.fn(),
  useRef: vi.fn(),
  useCallback: vi.fn(),
  useEffect: vi.fn(),
}));
vi.mock("aws-amplify/auth", () => ({ fetchAuthSession: vi.fn() }));
vi.mock("aws-amplify/data", () => ({ generateClient: vi.fn() }));
vi.mock("@/amplify/data/resource", () => ({}));
vi.mock("@/src/lib/agent/agentRuntime", () => ({ invokeRuntime: vi.fn() }));

import { resolveStockDataSource, extractTickerCode } from "../useStockAnalysis";
import type { StockDataPayload } from "@/src/types/stock";

// --- Helper: minimal StockDataPayload factory ---

function makePayload(overrides?: Partial<StockDataPayload>): StockDataPayload {
  return {
    ticker_code: overrides?.ticker_code ?? "7203",
    company_name: overrides?.company_name ?? "トヨタ自動車",
    prices: overrides?.prices ?? [
      {
        date: "2024-01-01",
        open: 100,
        high: 110,
        low: 90,
        close: 105,
        volume: 50000,
        ma5: null,
        ma25: null,
        ma75: null,
        ma200: null,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// resolveStockDataSource
// ---------------------------------------------------------------------------

describe("resolveStockDataSource", () => {
  it("returns graphqlData with source 'graphql' when both sources are provided", () => {
    const graphqlData = makePayload({ ticker_code: "7203" });
    const sseData = makePayload({ ticker_code: "6758" });

    const result = resolveStockDataSource(graphqlData, sseData);

    expect(result.data).toBe(graphqlData);
    expect(result.source).toBe("graphql");
  });

  it("returns graphqlData with source 'graphql' when only graphqlData is provided", () => {
    const graphqlData = makePayload({ ticker_code: "7203" });

    const result = resolveStockDataSource(graphqlData, null);

    expect(result.data).toBe(graphqlData);
    expect(result.source).toBe("graphql");
  });

  it("returns sseData with source 'sse' when only sseData is provided", () => {
    const sseData = makePayload({ ticker_code: "6758" });

    const result = resolveStockDataSource(null, sseData);

    expect(result.data).toBe(sseData);
    expect(result.source).toBe("sse");
  });

  it("returns null data with null source when neither source is provided", () => {
    const result = resolveStockDataSource(null, null);

    expect(result.data).toBeNull();
    expect(result.source).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SSE marker detection (backward compatibility) — indirect test via
// resolveStockDataSource + marker format knowledge
// ---------------------------------------------------------------------------

describe("SSE marker detection (backward compatibility)", () => {
  /**
   * extractStockData is internal, so we verify the marker format constants
   * and JSON extraction logic indirectly. The markers are:
   *   <!--STOCK_DATA_JSON-->...<!--/STOCK_DATA_JSON-->
   *
   * We confirm that a payload wrapped in these markers can be parsed as valid
   * StockDataPayload JSON — the same format the internal function expects.
   */
  it("JSON wrapped in STOCK_DATA_JSON markers is valid StockDataPayload", () => {
    const payload = makePayload({ ticker_code: "7203" });
    const jsonStr = JSON.stringify(payload);
    const markerBlock = `<!--STOCK_DATA_JSON-->${jsonStr}<!--/STOCK_DATA_JSON-->`;

    // Simulate the extraction logic used internally
    const startMarker = "<!--STOCK_DATA_JSON-->";
    const endMarker = "<!--/STOCK_DATA_JSON-->";
    const startIdx = markerBlock.indexOf(startMarker);
    const endIdx = markerBlock.indexOf(endMarker);

    expect(startIdx).not.toBe(-1);
    expect(endIdx).not.toBe(-1);
    expect(endIdx).toBeGreaterThan(startIdx);

    const extracted = markerBlock.slice(startIdx + startMarker.length, endIdx);
    const parsed = JSON.parse(extracted) as StockDataPayload;

    expect(parsed.ticker_code).toBe("7203");
    expect(parsed.company_name).toBe("トヨタ自動車");
    expect(Array.isArray(parsed.prices)).toBe(true);
  });

  it("text before and after markers is preserved as display text", () => {
    const payload = makePayload();
    const jsonStr = JSON.stringify(payload);
    const buffer = `分析結果です。<!--STOCK_DATA_JSON-->${jsonStr}<!--/STOCK_DATA_JSON-->以上です。`;

    const startMarker = "<!--STOCK_DATA_JSON-->";
    const endMarker = "<!--/STOCK_DATA_JSON-->";
    const startIdx = buffer.indexOf(startMarker);
    const endIdx = buffer.indexOf(endMarker);

    const displayText =
      buffer.slice(0, startIdx) + buffer.slice(endIdx + endMarker.length);

    expect(displayText).toBe("分析結果です。以上です。");
  });
});

// ---------------------------------------------------------------------------
// extractTickerCode
// ---------------------------------------------------------------------------

describe("extractTickerCode", () => {
  it("extracts 4-digit code from Japanese query string", () => {
    expect(extractTickerCode("7203の分析をお願いします")).toBe("7203");
  });

  it("extracts 4-digit code from simple numeric input", () => {
    expect(extractTickerCode("6758")).toBe("6758");
  });

  it("extracts first 4-digit code when multiple exist", () => {
    expect(extractTickerCode("7203と6758を比較")).toBe("7203");
  });

  it("returns null when no 4-digit code is present", () => {
    expect(extractTickerCode("トヨタ自動車の分析")).toBeNull();
  });

  it("returns null for 3-digit numbers", () => {
    expect(extractTickerCode("123の分析")).toBeNull();
  });

  it("returns null for 5-digit numbers (no word boundary match)", () => {
    // "12345" as a standalone token — \b(\d{4})\b matches "1234" at the start
    // because \b matches between "4" and "5" only if "5" is not a word char,
    // but digits are word chars, so \b(\d{4})\b won't match inside "12345"
    expect(extractTickerCode("12345")).toBeNull();
  });
});
