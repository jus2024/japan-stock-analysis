import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { transformOHLCVData } from "../handler";

/**
 * Property-based tests for Stock_Price_Function (handler.ts)
 *
 * Properties 1, 4, 5, 6 from the design document.
 */

// --- Arbitraries ---

/** Generate a valid OHLCV quote row (finite numbers or null). */
function ohlcvQuoteArb(length: number) {
  const numOrNull = fc.oneof(fc.double({ min: 0, max: 100_000, noNaN: true }), fc.constant(null));
  return fc.record({
    open: fc.array(numOrNull, { minLength: length, maxLength: length }),
    high: fc.array(numOrNull, { minLength: length, maxLength: length }),
    low: fc.array(numOrNull, { minLength: length, maxLength: length }),
    close: fc.array(numOrNull, { minLength: length, maxLength: length }),
    volume: fc.array(numOrNull, { minLength: length, maxLength: length }),
  });
}

/** Generate an array of Unix timestamps (seconds since epoch). */
function timestampsArb(length: number) {
  // Timestamps between 2020-01-01 and 2025-12-31
  const minTs = 1577836800;
  const maxTs = 1767225600;
  return fc.array(fc.integer({ min: minTs, max: maxTs }), {
    minLength: length,
    maxLength: length,
  });
}

// ---------------------------------------------------------------------------
// Property 1: StockDataPayload structural completeness
// ---------------------------------------------------------------------------

describe("Feature: stock-chart-prefetch, Property 1: StockDataPayload structural completeness", () => {
  /**
   * **Validates: Requirements 1.1, 1.2, 1.3**
   *
   * For any valid OHLCV data, transformOHLCVData returns data points that
   * contain all required fields: date, open, high, low, close, volume,
   * ma5, ma25, ma75, ma200.
   */
  it("every data point has all required fields", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }).chain((len) =>
          fc.tuple(timestampsArb(len), ohlcvQuoteArb(len))
        ),
        ([timestamps, quote]) => {
          const result = transformOHLCVData(timestamps, quote);

          expect(result.length).toBe(timestamps.length);

          const requiredKeys: string[] = [
            "date", "open", "high", "low", "close", "volume",
            "ma5", "ma25", "ma75", "ma200",
          ];

          for (const point of result) {
            for (const key of requiredKeys) {
              expect(point).toHaveProperty(key);
            }
            // date is a string
            expect(typeof point.date).toBe("string");
            // numeric fields are numbers
            expect(typeof point.open).toBe("number");
            expect(typeof point.high).toBe("number");
            expect(typeof point.low).toBe("number");
            expect(typeof point.close).toBe("number");
            expect(typeof point.volume).toBe("number");
            // ma fields are number or null
            for (const ma of [point.ma5, point.ma25, point.ma75, point.ma200]) {
              expect(ma === null || typeof ma === "number").toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: StockDataPayload JSON round-trip
// ---------------------------------------------------------------------------

describe("Feature: stock-chart-prefetch, Property 4: StockDataPayload JSON round-trip", () => {
  /**
   * **Validates: Requirements 6.1**
   *
   * For any valid StockDataPayload, JSON.stringify then JSON.parse
   * produces a deeply equal object.
   */
  it("JSON round-trip preserves equality", () => {
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
        fc.constant(null)
      ),
      ma25: fc.oneof(
        fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
        fc.constant(null)
      ),
      ma75: fc.oneof(
        fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
        fc.constant(null)
      ),
      ma200: fc.oneof(
        fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
        fc.constant(null)
      ),
    });

    const payloadArb = fc.record({
      ticker_code: fc.stringMatching(/^\d{4}$/),
      company_name: fc.string({ minLength: 1, maxLength: 50 }),
      prices: fc.array(stockDataPointArb, { minLength: 0, maxLength: 20 }),
    });

    fc.assert(
      fc.property(payloadArb, (payload) => {
        const serialized = JSON.stringify(payload);
        const deserialized = JSON.parse(serialized);
        expect(deserialized).toEqual(payload);
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: No NaN/Infinity in numeric fields
// ---------------------------------------------------------------------------

describe("Feature: stock-chart-prefetch, Property 5: No NaN/Infinity in numeric fields", () => {
  /**
   * **Validates: Requirements 6.2**
   *
   * For any OHLCV data that may include NaN, Infinity, -Infinity, null,
   * or undefined, transformOHLCVData never produces NaN or Infinity in
   * numeric fields (open, high, low, close, volume).
   */
  it("numeric fields never contain NaN or Infinity", () => {
    /** Generate a value that may be a normal number, null, undefined, NaN, Infinity, or -Infinity. */
    const dirtyNum = fc.oneof(
      fc.double({ min: 0, max: 100_000, noNaN: true }),
      fc.constant(null),
      fc.constant(undefined as unknown as number | null),
      fc.constant(NaN),
      fc.constant(Infinity),
      fc.constant(-Infinity)
    );

    function dirtyQuoteArb(length: number) {
      return fc.record({
        open: fc.array(dirtyNum, { minLength: length, maxLength: length }),
        high: fc.array(dirtyNum, { minLength: length, maxLength: length }),
        low: fc.array(dirtyNum, { minLength: length, maxLength: length }),
        close: fc.array(dirtyNum, { minLength: length, maxLength: length }),
        volume: fc.array(dirtyNum, { minLength: length, maxLength: length }),
      });
    }

    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }).chain((len) =>
          fc.tuple(timestampsArb(len), dirtyQuoteArb(len))
        ),
        ([timestamps, quote]) => {
          const result = transformOHLCVData(
            timestamps,
            quote as {
              open: (number | null)[];
              high: (number | null)[];
              low: (number | null)[];
              close: (number | null)[];
              volume: (number | null)[];
            }
          );

          for (const point of result) {
            for (const field of ["open", "high", "low", "close", "volume"] as const) {
              const val = point[field];
              expect(Number.isNaN(val)).toBe(false);
              expect(val === Infinity).toBe(false);
              expect(val === -Infinity).toBe(false);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Prices sorted by date ascending
// ---------------------------------------------------------------------------

describe("Feature: stock-chart-prefetch, Property 6: Prices sorted by date ascending", () => {
  /**
   * **Validates: Requirements 6.3**
   *
   * For any array of timestamps (possibly unsorted), transformOHLCVData
   * returns a prices array sorted by date ascending.
   */
  it("result is sorted by date ascending", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 50 }).chain((len) =>
          fc.tuple(timestampsArb(len), ohlcvQuoteArb(len))
        ),
        ([timestamps, quote]) => {
          const result = transformOHLCVData(timestamps, quote);

          for (let i = 1; i < result.length; i++) {
            expect(result[i].date >= result[i - 1].date).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
