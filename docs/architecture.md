# アーキテクチャ設計

## システム概要

日本株 AI 分析アプリは、フロントエンド（Next.js）、バックエンド（Amplify Gen 2）、AI エージェント（Strands Agents + AgentCore Runtime）の 3 層で構成されます。

## AWS サービス構成

```
┌─────────────────────────────────────────────────────────────────────┐
│  AWS Cloud (us-west-2)                                              │
│                                                                     │
│  ┌───────────────────────────────────────────────────┐              │
│  │  Amplify Hosting                                   │              │
│  │                                                   │              │
│  │  ┌─────────────┐  ┌──────────────┐               │              │
│  │  │ Next.js SSR │  │ CloudFront   │               │              │
│  │  │ (Lambda@Edge│←─│ Distribution │←── ユーザー    │              │
│  │  │  or Compute)│  └──────────────┘               │              │
│  │  └──────┬──────┘                                  │              │
│  │         │                                         │              │
│  │  ┌──────▼──────────────────────────────────┐      │              │
│  │  │  Amplify Backend (CDK)                   │      │              │
│  │  │                                         │      │              │
│  │  │  ┌──────────────┐   ┌────────────────┐  │      │              │
│  │  │  │ Amazon       │   │ Amazon Cognito │  │      │              │
│  │  │  │ AppSync      │   │ User Pool      │  │      │              │
│  │  │  │ (GraphQL API)│   │                │  │      │              │
│  │  │  └──────┬───────┘   └───────┬────────┘  │      │              │
│  │  │         │                   │            │      │              │
│  │  │  ┌──────▼───────┐          │            │      │              │
│  │  │  │ AWS Lambda   │          │            │      │              │
│  │  │  │ stock-price  │──→ Yahoo Finance     │      │              │
│  │  │  │ (Node.js 22) │    v8 API            │      │              │
│  │  │  └──────────────┘                      │      │              │
│  │  │                                         │      │              │
│  │  │  ┌──────────────┐                      │      │              │
│  │  │  │ Amazon       │                      │      │              │
│  │  │  │ DynamoDB     │                      │      │              │
│  │  │  │ (Todo等)     │                      │      │              │
│  │  │  └──────────────┘                      │      │              │
│  │  └─────────────────────────────────────────┘      │              │
│  └───────────────────────────────────────────────────┘              │
│                                                                     │
│  ┌───────────────────────────────────────────────────┐              │
│  │  Amazon Bedrock AgentCore Runtime                  │              │
│  │                                                   │              │
│  │  ┌─────────────────────────────────────────┐      │              │
│  │  │  jp_stock_agent (Python 3.11)            │      │              │
│  │  │                                         │      │              │
│  │  │  ┌──────────────┐  ┌─────────────────┐  │      │              │
│  │  │  │ Strands      │  │ Amazon Bedrock  │  │      │              │
│  │  │  │ Agents SDK   │─→│ Claude Sonnet   │  │      │              │
│  │  │  └──────────────┘  └─────────────────┘  │      │              │
│  │  │                                         │      │              │
│  │  │  Tools: get_stock_prices,               │      │              │
│  │  │         get_financial_data,              │      │              │
│  │  │         search_stock_news,               │      │              │
│  │  │         get_peer_comparison              │      │              │
│  │  └─────────────────────────────────────────┘      │              │
│  │                                                   │              │
│  │  JWT 認証: Cognito User Pool を参照               │              │
│  └───────────────────────────────────────────────────┘              │
│                                                                     │
│  ┌───────────────────────────────────────────────────┐              │
│  │  CI/CD                                             │              │
│  │                                                   │              │
│  │  GitHub Actions → lint, 型チェック                 │              │
│  │  Amplify Hosting → 自動ビルド・デプロイ（Git push）│              │
│  │  AgentCore CLI  → 手動デプロイ                     │              │
│  └───────────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

### サービス間の関係

| 接続元 | 接続先 | プロトコル | 認証方式 |
|--------|--------|-----------|---------|
| ブラウザ | Amplify Hosting (CloudFront) | HTTPS | — |
| Next.js SSR | AppSync GraphQL API | HTTPS | Cognito userPool |
| AppSync | stock-price Lambda | Lambda invoke | IAM (AppSync サービスロール) |
| stock-price Lambda | Yahoo Finance v8 API | HTTPS | — (パブリック API) |
| ブラウザ | AgentCore Runtime | HTTPS SSE | Cognito JWT Bearer |
| AgentCore Runtime | Amazon Bedrock | AWS SDK | IAM (実行ロール) |
| AgentCore Runtime | Cognito | OIDC Discovery | JWT 検証 |

### Cognito の共有

Amplify が作成する Cognito User Pool を、AgentCore Runtime の JWT 認証でも参照します。これにより、ユーザーは 1 回のログインで AppSync と AgentCore Runtime の両方にアクセスできます。

```
Cognito User Pool (Amplify 管理)
  │
  ├─→ AppSync: authorization allow.authenticated()
  │
  └─→ AgentCore Runtime: customJWTAuthorizer
       discoveryUrl: https://cognito-idp.<region>.amazonaws.com/<pool-id>/.well-known/openid-configuration
       allowedClients: [<app-client-id>]
```

注意: Amplify sandbox の Cognito と本番の Cognito は別インスタンスです。AgentCore Runtime の JWT 設定は環境ごとに異なります。

## コンポーネント構成

```
┌─────────────────────────────────────────────────────┐
│  フロントエンド（Amplify Hosting）                      │
│                                                     │
│  src/app/page.tsx          トップページ               │
│  src/hooks/useStockAnalysis.ts  並行呼び出しフック     │
│  src/components/stock/     チャート・レポート UI       │
│  src/lib/agent/            AgentCore SSE 通信        │
└──────────┬──────────────────────┬────────────────────┘
           │ GraphQL              │ HTTP SSE
           ▼                      ▼
┌──────────────────┐   ┌──────────────────────────────┐
│  Amplify Backend │   │  AgentCore Runtime            │
│                  │   │                              │
│  AppSync API     │   │  jp_stock_agent              │
│  Cognito Auth    │   │  ├─ get_stock_prices         │
│  stock-price     │   │  ├─ get_financial_data       │
│  Lambda          │   │  ├─ search_stock_news        │
│                  │   │  └─ get_peer_comparison      │
└────────┬─────────┘   └──────────────────────────────┘
         │
         ▼
┌──────────────────┐
│  Yahoo Finance   │
│  v8 API          │
└──────────────────┘
```

## データフロー

### 銘柄コードで検索した場合

1. ユーザーが「7203」を入力
2. フロントエンドが 2 つのリクエストを並行発火:
   - GraphQL `getStockPrices(tickerCode: "7203")` → Lambda → Yahoo Finance API
   - HTTP POST `/invocations` → AgentCore Runtime → エージェント
3. Lambda が 2〜3 秒でチャートデータを返却 → 即座にチャート描画
4. エージェントが約 60 秒かけて分析テキストを SSE ストリーミング

### 銘柄名で検索した場合

1. ユーザーが「トヨタ」を入力
2. フロントエンドは銘柄コードを抽出できないため、GraphQL クエリはスキップ
3. SSE ストリーミング開始 → エージェントが銘柄コードを特定
4. SSE テキストから銘柄コード（例: 7203）を検出
5. 後追いで GraphQL クエリを発火 → チャート描画

## 株価データ取得 Lambda

`amplify/functions/stock-price/handler.ts`

- Yahoo Finance v8 API (`/v8/finance/chart/{code}.T`) から過去 1 年分の日次 OHLCV データを取得
- 終値ベースの単純移動平均線（5 日・25 日・75 日・200 日）を算出
- NaN / Infinity / undefined を null に変換
- StockDataPayload 形式の JSON 文字列を返却

### エラーハンドリング

| エラー | 対応 |
|--------|------|
| 銘柄コードが 4 桁数字でない | バリデーションエラー |
| 銘柄が見つからない | 空データエラー |
| API タイムアウト（10 秒） | AbortController でタイムアウト |
| HTTP エラー | ステータスコード付きエラー |
| JSON パース失敗 | パースエラー |

## AI エージェント

`agents/jp_stock_agent/`

Strands Agents SDK ベースの Python エージェント。以下のツールを順次実行して総合分析レポートを生成します:

1. `get_stock_prices` — テクニカル分析用テキスト要約
2. `get_financial_data` — ファンダメンタルズ指標
3. `search_stock_news` — ニュース・IR 情報
4. `get_peer_comparison` — 同業種比較

### スコアリング

各分析カテゴリにスコアを付与し、総合スコア（0〜100）と投資判断ラベル（弱気〜強気）を算出します。

| カテゴリ | 配点 |
|---------|------|
| ファンダメンタルズ | 30 点 |
| テクニカル | 25 点 |
| ニュース | 20 点 |
| 同業種比較 | 25 点 |

## 認証

- Cognito User Pool は Amplify が管理
- フロントエンド → AppSync: Cognito userPool 認証
- フロントエンド → AgentCore Runtime: Cognito JWT Bearer トークン
- `getStockPrices` クエリは `allow.authenticated()` で認可

## デプロイ構成

```
GitHub Push
  │
  ├─→ GitHub Actions（lint, 型チェック, テスト）
  │
  ├─→ Amplify Hosting
  │     ├─ Next.js SSR ビルド
  │     ├─ AppSync API + stock-price Lambda
  │     └─ Cognito User Pool
  │
  └─→ AgentCore CLI（手動）
        └─ AgentCore Runtime（jp_stock_agent）
```

## テスト戦略

### プロパティベーステスト

| プロパティ | 検証内容 |
|-----------|---------|
| Property 1 | StockDataPayload の構造完全性 |
| Property 2 | GraphQL データソース優先 |
| Property 3 | エージェント出力に JSON マーカーなし |
| Property 4 | JSON ラウンドトリップ等価性 |
| Property 5 | 数値フィールドに NaN/Infinity なし |
| Property 6 | prices 配列の日付昇順ソート |

### ユニットテスト

- Lambda handler: モック API レスポンスでの変換・エラーケース
- useStockAnalysis: データソース優先・銘柄コード抽出
- Python tools: マーカー削除後の出力・テクニカル要約内容
