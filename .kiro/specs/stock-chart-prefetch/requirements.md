# 要件ドキュメント: 株価チャートプリフェッチ

## はじめに

日本株分析ページにおける体感待ち時間を短縮するための機能。現在、株価チャートデータはAgentCore Runtimeのエージェントが順次実行するツール内で取得され、LLMのテキスト生成（約62秒）完了後にSSEストリーム経由でフロントエンドに届く。本機能では、Amplify Gen 2のカスタムLambda関数（TypeScript）で株価データを独立して取得するAPIエンドポイントを新設し、フロントエンドからエージェント呼び出しと並行してLambdaを呼び出すことで、チャートを2〜3秒で表示する。エージェントのテキスト分析は従来通りSSEストリーミングで約60秒かけて表示される。

## 用語集

- **Stock_Price_Function**: Amplify Gen 2のdefineFunction で定義されるTypeScript Lambda関数。銘柄コードを受け取り、株価データ（日次終値・移動平均線）をJSON形式で返す
- **Stock_Data_API**: Amplify Gen 2のdefineDataスキーマ内でカスタムクエリとして定義されるGraphQLエンドポイント。Stock_Price_Functionをリゾルバとして使用する
- **Stock_Analyzer_Agent**: 既存の日本株分析Pythonエージェント。AgentCore Runtime上で動作し、ファンダメンタルズ分析・テクニカル分析・ニュース分析・同業種比較・総合評価を実行する
- **Stock_Analyzer_Page**: 銘柄入力と分析結果表示を担当するNext.jsフロントエンドページ（`src/app/stock-analyzer/page.tsx`）
- **Stock_Chart**: 株価チャートコンポーネント（`src/components/stock/StockChart.tsx`）。Rechartsで折れ線グラフ・出来高バーチャート・移動平均線を描画する
- **useStockAnalysis**: 株式分析専用のカスタムフック（`src/hooks/useStockAnalysis.ts`）。SSEストリーム通信とチャートデータ管理を担当する
- **並行呼び出し**: フロントエンドがStock_Data_APIとAgentCore Runtimeを同時に呼び出し、それぞれのレスポンスを独立して処理するパターン
- **StockDataPayload**: 株価データのJSON構造（`src/types/stock.ts`で定義済み）。ticker_code、company_name、pricesフィールドを含む

## 要件

### 要件1: 株価データ取得Lambda関数

**ユーザーストーリー:** 開発者として、株価データをエージェントとは独立して取得するLambda関数を用意したい。フロントエンドから直接呼び出すことで、エージェントのLLM処理を待たずにチャートデータを取得できるようにしたい。

#### 受入基準

1. THE Stock_Price_Function SHALL 銘柄コード（4桁の数字文字列）を入力パラメータとして受け取り、過去1年分の日次株価データをJSON形式で返す
2. THE Stock_Price_Function SHALL 各データポイントに日付、始値、高値、安値、終値、出来高、5日・25日・75日・200日移動平均線を含める
3. THE Stock_Price_Function SHALL 返却するJSONの構造を既存のStockDataPayload型（ticker_code、company_name、prices配列）と一致させる
4. WHEN 株価データの取得が完了した場合, THE Stock_Price_Function SHALL レスポンスを3秒以内に返す
5. IF 指定された銘柄コードに対応する上場企業が存在しない場合, THEN THE Stock_Price_Function SHALL 銘柄が見つからない旨のエラーメッセージを含むレスポンスを返す
6. IF 外部株価データAPIへのリクエストがタイムアウトまたはエラーを返した場合, THEN THE Stock_Price_Function SHALL エラー内容を含むレスポンスを返す
7. THE Stock_Price_Function SHALL TypeScriptで実装し、`amplify/functions/stock-price/` ディレクトリに配置する

### 要件2: Amplify Gen 2 バックエンド統合

**ユーザーストーリー:** 開発者として、Stock_Price_FunctionをAmplify Gen 2のバックエンドリソースとして定義し、フロントエンドからAmplifyクライアントライブラリ経由で呼び出せるようにしたい。

#### 受入基準

1. THE Stock_Data_API SHALL Amplify Gen 2のdefineDataスキーマ内にカスタムクエリ（`getStockPrices`）として定義する
2. THE Stock_Data_API SHALL `getStockPrices`クエリの引数として銘柄コード（tickerCode: String）を受け取る
3. THE Stock_Data_API SHALL `getStockPrices`クエリのリゾルバとしてStock_Price_Functionを使用する
4. THE Stock_Data_API SHALL 認証済みユーザーのみがクエリを実行できるよう認可ルールを設定する
5. WHEN `amplify/backend.ts`を更新する場合, THE Stock_Data_API SHALL 既存のauth、dataリソース定義を維持したまま、Stock_Price_Functionを追加する

### 要件3: フロントエンドの並行呼び出し

**ユーザーストーリー:** ユーザーとして、銘柄を入力した直後にチャートが表示され始めてほしい。AI分析テキストの完了を待たずに株価推移を確認したい。

#### 受入基準

1. WHEN ユーザーが銘柄コードを入力して分析を開始した場合, THE Stock_Analyzer_Page SHALL Stock_Data_APIへのチャートデータ取得リクエストとAgentCore Runtimeへのエージェント呼び出しを同時に開始する
2. WHEN Stock_Data_APIからチャートデータが返却された場合, THE Stock_Analyzer_Page SHALL エージェントの分析完了を待たずにStock_Chartを描画する
3. WHILE エージェントの分析が進行中の場合, THE Stock_Analyzer_Page SHALL チャート表示とストリーミングテキスト表示を同時に行う
4. IF Stock_Data_APIからのチャートデータ取得が失敗した場合, THEN THE Stock_Analyzer_Page SHALL エージェントのSSEストリーム内の株価データ（従来のマーカー方式）にフォールバックする
5. WHEN Stock_Data_APIとエージェントの両方から株価データが取得された場合, THE Stock_Analyzer_Page SHALL Stock_Data_APIのデータを優先して表示する（エージェント側のマーカーデータは無視する）

### 要件4: チャートのローディング状態管理

**ユーザーストーリー:** ユーザーとして、チャートデータの取得状況を把握したい。ローディング中であることが分かれば、待ち時間への不安が軽減される。

#### 受入基準

1. WHEN 分析が開始されStock_Data_APIへのリクエストが送信された場合, THE Stock_Analyzer_Page SHALL チャート領域にローディングインジケーターを表示する
2. WHEN Stock_Data_APIからチャートデータが正常に返却された場合, THE Stock_Analyzer_Page SHALL ローディングインジケーターを非表示にし、チャートを描画する
3. IF Stock_Data_APIからのチャートデータ取得が失敗しエージェントのフォールバックを待つ場合, THEN THE Stock_Analyzer_Page SHALL ローディングインジケーターを継続表示する
4. WHEN エージェントの分析が完了しチャートデータがいずれのソースからも取得できなかった場合, THE Stock_Analyzer_Page SHALL ローディングインジケーターを非表示にする

### 要件5: エージェント側の株価ツール簡略化

**ユーザーストーリー:** 開発者として、チャートデータがLambdaから提供されるようになったため、エージェントのget_stock_pricesツールからチャート用JSONマーカー出力を削除し、テクニカル分析用のテキスト要約のみを返すよう簡略化したい。

#### 受入基準

1. THE Stock_Analyzer_Agent SHALL get_stock_pricesツールの出力からチャート用JSONマーカー（`<!--STOCK_DATA_JSON-->...<!--/STOCK_DATA_JSON-->`）を削除する
2. THE Stock_Analyzer_Agent SHALL get_stock_pricesツールの出力としてテクニカル分析用のテキスト要約（終値、移動平均線、トレンド、ゴールデンクロス・デッドクロス、騰落率）のみを返す
3. WHEN useStockAnalysisフックがSSEストリームを処理する場合, THE useStockAnalysis SHALL 従来のJSONマーカー検出ロジックをフォールバック用として維持する（後方互換性のため）

### 要件6: 株価データのラウンドトリップ整合性

**ユーザーストーリー:** 開発者として、Stock_Price_FunctionとStock_Chartの間でデータ構造の整合性を保証したい。Lambda関数が返すJSONをフロントエンドでパースした結果が元のデータと等価であることを確認したい。

#### 受入基準

1. FOR ALL Stock_Price_Functionが返す有効なStockDataPayload JSONに対して, パースして再シリアライズした結果は元のデータと等価である（ラウンドトリップ特性）
2. THE Stock_Price_Function SHALL 返却するJSONの数値フィールドにNaN、Infinity、undefinedを含めない（nullは許容する）
3. THE Stock_Price_Function SHALL 返却するprices配列を日付昇順でソートする
