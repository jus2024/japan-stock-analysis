/**
 * 日本株分析 - 型定義
 */

/** 日次株価データポイント */
export interface StockDataPoint {
  date: string;        // "YYYY-MM-DD"
  open: number;        // 始値
  high: number;        // 高値
  low: number;         // 安値
  close: number;       // 終値
  volume: number;      // 出来高
  ma5: number | null;  // 5日移動平均
  ma25: number | null; // 25日移動平均
  ma75: number | null; // 75日移動平均
  ma200: number | null; // 200日移動平均
}

/** エージェントから受信する株価データJSON構造 */
export interface StockDataPayload {
  ticker_code: string;
  company_name: string;
  prices: StockDataPoint[];
}
