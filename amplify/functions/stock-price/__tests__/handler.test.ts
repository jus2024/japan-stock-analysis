import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handler, transformOHLCVData, calculateMovingAverage } from "../handler";

// --- Helper: build a minimal AppSync event ---

function makeEvent(tickerCode: string) {
  return {
    arguments: { tickerCode },
    // Minimal fields required by AppSyncResolverHandler
    info: { fieldName: "getStockPrices", parentTypeName: "Query", selectionSetList: [], selectionSetGraphQL: "" },
    request: { headers: {} },
    source: null,
    prev: null,
    stash: {},
    identity: null,
  } as unknown as Parameters<typeof handler>[0];
}

// --- Helper: build a realistic Yahoo Finance v8 API response ---

function makeYahooResponse(overrides?: {
  timestamps?: number[];
  opens?: (number | null)[];
  highs?: (number | null)[];
  lows?: (number | null)[];
  closes?: (number | null)[];
  volumes?: (number | null)[];
  longName?: string;
  symbol?: string;
  error?: { code: string; description: string } | null;
  emptyResult?: boolean;
}) {
  const timestamps = overrides?.timestamps ?? [
    1704067200, // 2024-01-01
    1704153600, // 2024-01-02
    1704240000, // 2024-01-03
    1704326400, // 2024-01-04
    1704412800, // 2024-01-05
    1704499200, // 2024-01-06
    1704585600, // 2024-01-07
  ];
  const len = timestamps.length;

  const closes = overrides?.closes ?? Array.from({ length: len }, (_, i) => 100 + i * 10);
  const opens = overrides?.opens ?? closes.map((c) => (c !== null ? c - 5 : null));
  const highs = overrides?.highs ?? closes.map((c) => (c !== null ? c + 5 : null));
  const lows = overrides?.lows ?? closes.map((c) => (c !== null ? c - 10 : null));
  const volumes = overrides?.volumes ?? Array.from({ length: len }, () => 1_000_000);

  if (overrides?.emptyResult) {
    return {
      chart: {
        result: [],
        error: overrides?.error ?? null,
      },
    };
  }

  return {
    chart: {
      result: [
        {
          meta: {
            symbol: overrides?.symbol ?? "7203.T",
            longName: overrides?.longName ?? "Toyota Motor Corporation",
            currency: "JPY",
            regularMarketPrice: closes[closes.length - 1] ?? 0,
          },
          timestamp: timestamps,
          indicators: {
            quote: [{ open: opens, high: highs, low: lows, close: closes, volume: volumes }],
          },
        },
      ],
      error: overrides?.error ?? null,
    },
  };
}

// --- Tests ---

describe("Lambda handler unit tests", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // 1. Valid ticker code
  // -----------------------------------------------------------------------
  describe("valid ticker code (e.g. 7203)", () => {
    it("returns a valid StockDataPayload JSON with correct structure", async () => {
      const yahooData = makeYahooResponse();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(yahooData),
      });

      const result = await handler(makeEvent("7203"), {} as never, () => {});
      expect(typeof result).toBe("string");

      const parsed = JSON.parse(result as string);
      expect(parsed.ticker_code).toBe("7203");
      expect(parsed.company_name).toBe("Toyota Motor Corporation");
      expect(Array.isArray(parsed.prices)).toBe(true);
      expect(parsed.prices.length).toBe(7);
    });

    it("calculates moving averages correctly (ma5 null for first 4 points)", async () => {
      const yahooData = makeYahooResponse();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(yahooData),
      });

      const result = await handler(makeEvent("7203"), {} as never, () => {});
      const parsed = JSON.parse(result as string);

      // First 4 points should have ma5 = null
      for (let i = 0; i < 4; i++) {
        expect(parsed.prices[i].ma5).toBeNull();
      }
      // 5th point (index 4) should have a valid ma5
      expect(typeof parsed.prices[4].ma5).toBe("number");

      // All points should have ma25 = null (only 7 data points)
      for (const p of parsed.prices) {
        expect(p.ma25).toBeNull();
        expect(p.ma75).toBeNull();
        expect(p.ma200).toBeNull();
      }
    });
  });

  // -----------------------------------------------------------------------
  // 2. Invalid ticker code format
  // -----------------------------------------------------------------------
  describe("invalid ticker code format", () => {
    it("rejects alphabetic ticker code", async () => {
      const result = await handler(makeEvent("ABC"), {} as never, () => {});
      const parsed = JSON.parse(result as string);
      expect(parsed.error).toContain("Invalid ticker code");
    });

    it("rejects 5-digit ticker code", async () => {
      const result = await handler(makeEvent("12345"), {} as never, () => {});
      const parsed = JSON.parse(result as string);
      expect(parsed.error).toContain("Invalid ticker code");
    });
  });

  // -----------------------------------------------------------------------
  // 3. Ticker not found (empty data)
  // -----------------------------------------------------------------------
  describe("ticker not found (empty data)", () => {
    it("returns error when result array is empty", async () => {
      const yahooData = makeYahooResponse({ emptyResult: true });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(yahooData),
      });

      const result = await handler(makeEvent("9999"), {} as never, () => {});
      const parsed = JSON.parse(result as string);
      expect(parsed.error).toContain("No data found");
      expect(parsed.error).toContain("not be listed");
    });

    it("returns error when timestamps are empty", async () => {
      const yahooData = makeYahooResponse({ timestamps: [] });
      // Fix: empty timestamps means empty quote arrays too
      yahooData.chart.result[0].indicators.quote[0] = {
        open: [], high: [], low: [], close: [], volume: [],
      };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(yahooData),
      });

      const result = await handler(makeEvent("9999"), {} as never, () => {});
      const parsed = JSON.parse(result as string);
      expect(parsed.error).toContain("No data found");
    });
  });

  // -----------------------------------------------------------------------
  // 4. API timeout
  // -----------------------------------------------------------------------
  describe("API timeout", () => {
    it("returns timeout error when fetch is aborted", async () => {
      const abortError = new DOMException("The operation was aborted.", "AbortError");
      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      const result = await handler(makeEvent("7203"), {} as never, () => {});
      const parsed = JSON.parse(result as string);
      expect(parsed.error).toContain("timed out");
    });
  });

  // -----------------------------------------------------------------------
  // 5. HTTP error
  // -----------------------------------------------------------------------
  describe("HTTP error", () => {
    it("returns HTTP error message for status 500", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await handler(makeEvent("7203"), {} as never, () => {});
      const parsed = JSON.parse(result as string);
      expect(parsed.error).toContain("HTTP 500");
    });
  });

  // -----------------------------------------------------------------------
  // 6. JSON parse failure
  // -----------------------------------------------------------------------
  describe("JSON parse failure", () => {
    it("returns parse error when response is not valid JSON", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
      });

      const result = await handler(makeEvent("7203"), {} as never, () => {});
      const parsed = JSON.parse(result as string);
      expect(parsed.error).toContain("Failed to parse JSON");
    });
  });

  // -----------------------------------------------------------------------
  // 7. Moving average edge case: fewer than 5 data points
  // -----------------------------------------------------------------------
  describe("moving average edge case", () => {
    it("all ma5 values are null when fewer than 5 data points", async () => {
      const timestamps = [1704067200, 1704153600, 1704240000]; // 3 points
      const yahooData = makeYahooResponse({
        timestamps,
        closes: [100, 110, 120],
        opens: [95, 105, 115],
        highs: [105, 115, 125],
        lows: [90, 100, 110],
        volumes: [1000, 2000, 3000],
      });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(yahooData),
      });

      const result = await handler(makeEvent("7203"), {} as never, () => {});
      const parsed = JSON.parse(result as string);

      expect(parsed.prices.length).toBe(3);
      for (const p of parsed.prices) {
        expect(p.ma5).toBeNull();
      }
    });
  });
});

// --- Direct function tests ---

describe("transformOHLCVData", () => {
  it("converts timestamps to YYYY-MM-DD date strings", () => {
    const result = transformOHLCVData(
      [1704067200], // 2024-01-01 UTC
      { open: [100], high: [110], low: [90], close: [105], volume: [5000] }
    );
    expect(result[0].date).toBe("2024-01-01");
  });

  it("replaces null values with 0", () => {
    const result = transformOHLCVData(
      [1704067200],
      { open: [null], high: [null], low: [null], close: [null], volume: [null] }
    );
    expect(result[0].open).toBe(0);
    expect(result[0].close).toBe(0);
    expect(result[0].volume).toBe(0);
  });
});

describe("calculateMovingAverage", () => {
  it("returns null for indices below period - 1", () => {
    const result = calculateMovingAverage([10, 20, 30, 40, 50], 5);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeNull();
    expect(result[3]).toBeNull();
    expect(result[4]).toBe(30); // (10+20+30+40+50)/5
  });

  it("calculates correct averages for period 3", () => {
    const result = calculateMovingAverage([10, 20, 30, 40], 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBe(20); // (10+20+30)/3
    expect(result[3]).toBe(30); // (20+30+40)/3
  });

  it("returns all nulls when data length is less than period", () => {
    const result = calculateMovingAverage([10, 20], 5);
    expect(result).toEqual([null, null]);
  });
});
