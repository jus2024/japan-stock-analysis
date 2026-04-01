# タスク: 株価チャートプリフェッチ

## タスク1: Stock_Price_Function Lambda関数の作成

- [x] 1.1 `amplify/functions/stock-price/resource.ts` を作成し、`defineFunction`でLambda関数を定義する（name: "stock-price", timeoutSeconds: 15, memoryMB: 256）
- [x] 1.2 `amplify/functions/stock-price/handler.ts` を作成し、AppSyncResolverHandlerとしてメインハンドラを実装する
  - [x] 1.2.1 引数の`tickerCode`バリデーション（4桁数字チェック）を実装する
  - [x] 1.2.2 Yahoo Finance v8 API (`https://query1.finance.yahoo.com/v8/finance/chart/{code}.T`) へのfetchリクエストを実装する（range=1y, interval=1d, AbortControllerで10秒タイムアウト）
  - [x] 1.2.3 APIレスポンスからOHLCVデータを抽出し、StockDataPoint配列に変換するロジックを実装する（NaN/Infinity/undefinedをnullに変換）
  - [x] 1.2.4 終値ベースの単純移動平均線（5日・25日・75日・200日）算出ロジックを実装する（N日未満はnull）
  - [x] 1.2.5 StockDataPayload形式（ticker_code, company_name, prices）のJSON文字列を返却する処理を実装する
  - [x] 1.2.6 エラーハンドリングを実装する（銘柄未発見、APIタイムアウト、HTTPエラー、JSONパース失敗）

## タスク2: Amplify Gen 2 バックエンド統合

- [x] 2.1 `amplify/data/resource.ts` に`getStockPrices`カスタムクエリを追加する（引数: tickerCode: String, 戻り値: String, 認可: authenticated, ハンドラ: stockPriceFunction）
- [x] 2.2 `amplify/backend.ts` に`stockPriceFunction`のインポートと登録を追加する

## タスク3: useStockAnalysisフックの並行呼び出し対応

- [x] 3.1 `useStockAnalysis`フックの`analyze`関数にAmplify GraphQLクライアント経由の`getStockPrices`クエリ呼び出しを追加する
- [x] 3.2 GraphQLクエリとSSE通信の並行実行ロジックを実装する（GraphQLクエリ成功時は即座にstockDataをセット）
- [x] 3.3 GraphQL失敗時のSSEマーカーフォールバックロジックを実装する（従来のextractStockData関数を維持）
- [x] 3.4 データソース優先ロジックを実装する（GraphQL側のデータが存在する場合、SSE側のマーカーデータを無視する）

## タスク4: チャートのローディング状態管理の更新

- [x] 4.1 `useStockAnalysis`フックのローディング状態管理を更新する（分析開始時にisLoadingChart=true、GraphQLデータ到着時にfalse、フォールバック中は継続表示、全ソース失敗時にfalse）

## タスク5: エージェント側get_stock_pricesツールの簡略化

- [x] 5.1 `agents/jp_stock_agent/tools.py` の`get_stock_prices`関数から`<!--STOCK_DATA_JSON-->...<!--/STOCK_DATA_JSON-->`マーカーブロック生成ロジックを削除する
- [x] 5.2 `get_stock_prices`関数がテクニカル分析用テキスト要約のみを返すよう変更する（chart_prices構築、chart_payload、marker_block関連コードを削除）
- [x] 5.3 `agents/jp_stock_agent/agent.py` のSYSTEM_PROMPTからJSONマーカー規約セクションを削除する

## タスク6: プロパティベーステストの実装

- [x] 6.1 `fast-check`をdevDependenciesに追加する
  - [x] 6.1.1 🧪 Property 1: ランダムなOHLCVデータに対して変換関数がStockDataPayloadの全必須フィールドを含むことを検証する `Feature: stock-chart-prefetch, Property 1: StockDataPayload structural completeness`
  - [x] 6.1.2 🧪 Property 4: ランダムなStockDataPayloadに対してJSON.stringify→JSON.parseラウンドトリップが等価であることを検証する `Feature: stock-chart-prefetch, Property 4: StockDataPayload JSON round-trip`
  - [x] 6.1.3 🧪 Property 5: ランダムなOHLCVデータ（NaN/Infinity含む）に対して変換後の数値フィールドにNaN/Infinityが含まれないことを検証する `Feature: stock-chart-prefetch, Property 5: No NaN/Infinity in numeric fields`
  - [x] 6.1.4 🧪 Property 6: ランダムな日付配列に対して変換後のprices配列が日付昇順ソートされていることを検証する `Feature: stock-chart-prefetch, Property 6: Prices sorted by date ascending`
  - [x] 6.1.5 🧪 Property 2: ランダムな2つのStockDataPayloadに対してGraphQL側とSSE側の両方がセットされた場合、GraphQL側が優先されることを検証する `Feature: stock-chart-prefetch, Property 2: GraphQL data source priority`
- [x] 6.2 Python側プロパティテスト
  - [x] 6.2.1 🧪 Property 3: ランダムな銘柄コードに対して変更後のget_stock_prices出力にJSONマーカーが含まれないことを検証する（モック使用） `Feature: stock-chart-prefetch, Property 3: No JSON marker in agent output`

## タスク7: ユニットテストの実装

- [x] 7.1 Lambda handler のユニットテストを作成する（モックAPIレスポンスでの変換確認、エラーケース）
- [x] 7.2 useStockAnalysisフックのユニットテストを作成する（フォールバック動作、ローディング状態遷移）
- [x] 7.3 Python側get_stock_pricesのユニットテストを更新する（マーカー削除後の出力確認）
