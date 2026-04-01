import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";

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

import { resolveStockDataSource } from "../useStockAnalysis";
import type { StockDataPayload } from "@/src/types/stock";

/**
 * Property-based tests for useStockAnalysis hook (resolveStockDataSource).
 *
 * Property 2 from the design document.
 */

// --- Arbitrary: StockDataPayload ---

const stockDataPointArb = fc.record({
  date: fc.integer({ min: 2020, max: 2025 }).chain((year) =>
    fc.integer({ min: 1, max: 12 }).chain((month) =>
      fc.integer({ min: 1, max: 28 }).map(
        (day) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      )
    )
  ),
  open: fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
  high: fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
  low: fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
  close: fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
  volume: fc.double({ min: 0, max: 1_000_000_000, noNaN: true, noDefaultInfinity: true }),
  ma5: fc.oneof(
    fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
    fc.constant(null),
  ),
  ma25: fc.oneof(
    fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
    fc.constant(null),
  ),
  ma75: fc.oneof(
    fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
    fc.constant(null),
  ),
  ma200: fc.oneof(
    fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
    fc.constant(null),
  ),
});

const payloadArb: fc.Arbitrary<StockDataPayload> = fc.record({
  ticker_code: fc.stringMatching(/^\d{4}$/),
  company_name: fc.string({ minLength: 1, maxLength: 50 }),
  prices: fc.array(stockDataPointArb, { minLength: 1, maxLength: 10 }),
});

// ---------------------------------------------------------------------------
// Property 2: GraphQL data source priority
// ---------------------------------------------------------------------------

describe("Feature: stock-chart-prefetch, Property 2: GraphQL data source priority", () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * When both graphqlData and sseData are non-null, the result is graphqlData.
   * When only graphqlData is non-null, the result is graphqlData.
   * When only sseData is non-null, the result is sseData.
   * When both are null, the result is null.
   */
  it("graphQL data is prioritized over SSE data", () => {
    fc.assert(
      fc.property(payloadArb, payloadArb, (graphqlData, sseData) => {
        // Case 1: Both non-null → graphqlData wins
        const both = resolveStockDataSource(graphqlData, sseData);
        expect(both.data).toBe(graphqlData);
        expect(both.source).toBe("graphql");

        // Case 2: Only graphqlData → graphqlData
        const gqlOnly = resolveStockDataSource(graphqlData, null);
        expect(gqlOnly.data).toBe(graphqlData);
        expect(gqlOnly.source).toBe("graphql");

        // Case 3: Only sseData → sseData
        const sseOnly = resolveStockDataSource(null, sseData);
        expect(sseOnly.data).toBe(sseData);
        expect(sseOnly.source).toBe("sse");

        // Case 4: Both null → null
        const neither = resolveStockDataSource(null, null);
        expect(neither.data).toBeNull();
        expect(neither.source).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});
