# 日本株 AI 分析アプリ

銘柄コードまたは銘柄名を入力すると、AI エージェントがファンダメンタルズ・テクニカル・ニュース・同業種比較の多角的な分析レポートを生成します。株価チャートは Lambda 経由で並行取得し、2〜3 秒で描画します。

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Next.js 15 + TypeScript |
| バックエンド | AWS Amplify Gen 2（AppSync, Cognito, Lambda） |
| AI エージェント | Python / Strands Agents SDK |
| エージェント実行基盤 | Amazon Bedrock AgentCore Runtime |
| 株価データ | Yahoo Finance API（yfinance） |
| ホスティング | Amplify Hosting |
| IDE 支援 | Kiro |

## アーキテクチャ

```
ユーザー
  │
  ├─→ [Amplify GraphQL API] ─→ [stock-price Lambda] ─→ Yahoo Finance v8 API
  │     チャートデータ（2-3秒）
  │
  └─→ [AgentCore Runtime] ─→ [jp_stock_agent]
        分析テキスト SSE ストリーミング（~60秒）
```

フロントエンドは GraphQL クエリと SSE 通信を並行実行します。チャートは Lambda から即座に描画し、分析テキストはエージェントからストリーミング表示します。詳細は [docs/architecture.md](docs/architecture.md) を参照してください。

## エージェントの分析機能

日本株分析エージェントは以下のツールを順次実行して総合分析レポートを生成します。

| ツール | 機能 |
|--------|------|
| `search_stock` | 銘柄コードまたは銘柄名から企業を特定 |
| `get_stock_prices` | 過去1年分の株価データとテクニカル指標を取得 |
| `get_financial_metrics` | PER・PBR・ROE・配当利回り（予想/実績）等の財務指標を取得 |
| `search_news` | 直近ニュース・IR情報を取得し影響度を評価 |
| `get_sector_peers` | 同一業種の上場企業を動的検索し財務指標を比較 |

同業種比較は yfinance Screener API を使って `industry`（業種小分類）単位で動的に検索するため、静的リストでカバーしきれないニッチな業種にも対応します。

## ディレクトリ構成

```
src/                    # フロントエンド（Next.js App Router）
  app/                  # ページとレイアウト
  components/stock/     # 株価チャート・分析レポート UI
  hooks/                # カスタムフック（useStockAnalysis）
  lib/                  # Amplify 設定、AgentCore 通信
  types/                # 型定義
amplify/                # Amplify Gen 2 バックエンド定義
  functions/stock-price/ # 株価データ取得 Lambda
agents/                 # Strands エージェント（オプション）
  jp_stock_agent/       # 日本株分析エージェント
  common/               # 共通処理（設定、ログ）
  scripts/              # ローカル実行・環境変数設定スクリプト
docs/                   # ドキュメント
.kiro/                  # Kiro ワークスペース設定
```

## セットアップ

### 前提条件

- Node.js 20（`.nvmrc` で指定済み）
- Python 3.10+（エージェント機能を使う場合）
- AWS アカウントと認証情報

### Web アプリ

```bash
nvm use           # Node 20 に切り替え
npm ci
cp .env.example .env.local

# Amplify sandbox 起動（別ターミナル）
npx ampx sandbox

# 開発サーバー起動
npm run dev
```

### エージェント（オプション）

```bash
cd agents
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

# ローカル動作確認（AgentCore Runtime 不要）
python scripts/run_local.py
```

## デプロイ

Amplify Hosting と AgentCore Runtime は別々にデプロイします。

### 1. Amplify Hosting

GitHub リポジトリを Amplify に接続すると、push で自動デプロイされます。

### 2. AgentCore Runtime

```bash
cd agents
agentcore configure   # JWT 認証に Cognito の情報を設定
agentcore launch      # ビルド & デプロイ
./scripts/set_env.sh  # 環境変数を設定（launch 後に毎回実行）
```

> **注意**: `agentcore launch` は `agents/.env` の内容を Runtime に自動反映しません。デプロイ後は必ず `set_env.sh` を実行して環境変数を設定してください。

### 3. 接続

Amplify コンソールで環境変数 `NEXT_PUBLIC_JP_STOCK_AGENT_RUNTIME_ARN` に Runtime ARN を設定して再デプロイ。

詳細は [docs/deployment.md](docs/deployment.md) を参照してください。

## テスト

```bash
# TypeScript（ユニットテスト + プロパティベーステスト）
npx vitest --run

# Python（エージェント）
cd agents
python -m pytest jp_stock_agent/ -v
```

## リソース削除

```bash
# 1. AgentCore Runtime
cd agents && agentcore destroy

# 2. Amplify Hosting
# AWS コンソール → Amplify → アプリを削除

# 3. Sandbox（開発用）
npx ampx sandbox delete
```

## ドキュメント

- [アーキテクチャ設計](docs/architecture.md)
- [セットアップガイド](docs/setup.md)
- [デプロイガイド](docs/deployment.md)
- [Kiro の使い方](docs/kiro-usage.md)

## ライセンス

[MIT-0](LICENSE)
