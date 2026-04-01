import type { AppSyncResolverHandler } from "aws-lambda";

// --- Interfaces ---

interface GetStockPricesArgs {
  tickerCode: string;
}

interface StockDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma5: number | null;
  ma25: number | null;
  ma75: number | null;
  ma200: number | null;
}

interface StockDataPayload {
  ticker_code: string;
  company_name: string;
  prices: StockDataPoint[];
}

interface YahooFinanceChartResponse {
  chart: {
    result: Array<{
      meta: {
        symbol: string;
        shortName?: string;
        longName?: string;
        currency: string;
        regularMarketPrice: number;
      };
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }>;
    error: { code: string; description: string } | null;
  };
}

// --- Helper: sanitize numeric value (NaN/Infinity/undefined → null) ---

function sanitizeNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

// --- Exported helper: transform OHLCV data from Yahoo Finance response ---

export function transformOHLCVData(
  timestamps: number[],
  quote: {
    open: (number | null)[];
    high: (number | null)[];
    low: (number | null)[];
    close: (number | null)[];
    volume: (number | null)[];
  }
): StockDataPoint[] {
  const points: StockDataPoint[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const d = new Date(ts * 1000);
    const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

    const open = sanitizeNumber(quote.open[i]);
    const high = sanitizeNumber(quote.high[i]);
    const low = sanitizeNumber(quote.low[i]);
    const close = sanitizeNumber(quote.close[i]);
    const volume = sanitizeNumber(quote.volume[i]);

    points.push({
      date,
      open: open ?? 0,
      high: high ?? 0,
      low: low ?? 0,
      close: close ?? 0,
      volume: volume ?? 0,
      ma5: null,
      ma25: null,
      ma75: null,
      ma200: null,
    });
  }

  // Sort by date ascending
  points.sort((a, b) => a.date.localeCompare(b.date));

  return points;
}

// --- Exported helper: calculate simple moving average ---

export function calculateMovingAverage(
  closes: number[],
  period: number
): (number | null)[] {
  const result: (number | null)[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += closes[j];
      }
      const avg = sum / period;
      result.push(sanitizeNumber(avg));
    }
  }

  return result;
}

// --- Main handler ---

export const handler: AppSyncResolverHandler<GetStockPricesArgs, string> = async (event) => {
  const { tickerCode } = event.arguments;

  // 1.2.1: Validate tickerCode (must be 4-digit number)
  if (!/^\d{4}$/.test(tickerCode)) {
    return JSON.stringify({
      error: `Invalid ticker code: "${tickerCode}". Must be a 4-digit number.`,
    });
  }

  // 1.2.2: Fetch from Yahoo Finance v8 API with 10s timeout
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${tickerCode}.T?range=1y&interval=1d`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return JSON.stringify({
        error: `Request timed out while fetching data for ticker "${tickerCode}".`,
      });
    }
    return JSON.stringify({
      error: `Network error while fetching data for ticker "${tickerCode}": ${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  // 1.2.6: HTTP error handling
  if (!response.ok) {
    return JSON.stringify({
      error: `Yahoo Finance API returned HTTP ${response.status} for ticker "${tickerCode}".`,
    });
  }

  // 1.2.6: JSON parse error handling
  let data: YahooFinanceChartResponse;
  try {
    data = (await response.json()) as YahooFinanceChartResponse;
  } catch {
    return JSON.stringify({
      error: `Failed to parse JSON response for ticker "${tickerCode}".`,
    });
  }

  // 1.2.6: API-level error
  if (data.chart.error) {
    return JSON.stringify({
      error: `Yahoo Finance API error for ticker "${tickerCode}": ${data.chart.error.description}`,
    });
  }

  // 1.2.6: Ticker not found (empty result)
  const result = data.chart.result?.[0];
  if (!result || !result.timestamp || result.timestamp.length === 0) {
    return JSON.stringify({
      error: `No data found for ticker "${tickerCode}". The stock may not be listed.`,
    });
  }

  // 1.2.3: Extract OHLCV data and transform
  const quote = result.indicators.quote[0];
  const prices = transformOHLCVData(result.timestamp, quote);

  // 1.2.4: Calculate moving averages (5, 25, 75, 200 days)
  const closes = prices.map((p) => p.close);
  const ma5 = calculateMovingAverage(closes, 5);
  const ma25 = calculateMovingAverage(closes, 25);
  const ma75 = calculateMovingAverage(closes, 75);
  const ma200 = calculateMovingAverage(closes, 200);

  for (let i = 0; i < prices.length; i++) {
    prices[i].ma5 = ma5[i];
    prices[i].ma25 = ma25[i];
    prices[i].ma75 = ma75[i];
    prices[i].ma200 = ma200[i];
  }

  // 1.2.5: Build and return StockDataPayload JSON string
  const companyName = result.meta.longName ?? result.meta.shortName ?? result.meta.symbol;

  const payload: StockDataPayload = {
    ticker_code: tickerCode,
    company_name: companyName,
    prices,
  };

  return JSON.stringify(payload);
};
