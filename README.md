# Amplify Gen 2 業務 Web アプリテンプレート

AWS Amplify Gen 2 を中核にした業務 Web アプリケーション用のスターターテンプレートです。
オプションで Strands Agents による AI エージェント機能を追加できます。

## 想定ユースケース

1. 標準的な業務 Web アプリケーション
2. AI エージェント機能を含む業務 Web アプリケーション

Web アプリケーションがデフォルトの主役です。エージェント機能はオプション拡張として必要な場合のみ追加します。

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Next.js + TypeScript |
| バックエンド | AWS Amplify Gen 2 |
| エージェント（任意） | Python 3.10+ / Strands Agents SDK |
| エージェント実行基盤（任意） | Amazon Bedrock AgentCore Runtime |
| ホスティング | Amplify Hosting |
| リポジトリ | GitHub |
| IDE 支援 | Kiro |

## ディレクトリ構成

```
src/                    # フロントエンド（Next.js App Router）
  app/                  # ページとレイアウト
  app/sample/           # サンプルページ（Todo + エージェントチャット）
  components/agent/     # エージェントチャット UI コンポーネント
  hooks/                # カスタムフック
  lib/                  # ユーティリティ（Amplify 設定、AgentCore 通信）
  types/                # 型定義
amplify/                # Amplify Gen 2 バックエンド定義
agents/                 # Strands エージェント（任意）
docs/                   # ドキュメント
.kiro/                  # Kiro ワークスペース設定
.github/                # CI/CD とリポジトリテンプレート
```

## クイックスタート（サンプルを動かす）

テンプレートからリポジトリを作成し、サンプルページを動かすまでの手順です。

### 1. リポジトリの作成とセットアップ

```bash
# GitHub で "Use this template" → 新しいリポジトリを作成 → クローン
git clone <リポジトリURL>
cd <プロジェクト名>
npm ci
```

### 2. Web アプリの起動（Todo サンプル）

```bash
# ターミナル 1: Amplify sandbox を起動（初回は数分かかります）
npx ampx sandbox

# ターミナル 2: 開発サーバーを起動
npm run dev
```

ブラウザで `http://localhost:3000/sample` にアクセスすると、Todo リストのサンプルが動作します。

### 3. エージェントチャットの有効化（任意）

エージェントチャットを動かすには、追加で AgentCore Runtime のデプロイが必要です。

```bash
# エージェントのセットアップ
cd agents
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# 環境変数の設定
cp .env.example .env
# .env を編集して必要な値を設定

# ローカルでの動作確認（AgentCore Runtime 不要）
python scripts/run_local.py
```

本番デプロイの手順は [docs/deployment.md](docs/deployment.md) を参照してください。
デプロイ後、Amplify コンソールで `NEXT_PUBLIC_AGENTCORE_RUNTIME_ARN` を設定すると `/sample` ページのエージェントチャットが有効になります。

## プログラム更新時のデプロイ

### フロントエンドの更新

```bash
git add -A
git commit -m "変更内容の説明"
git push origin <ブランチ名>
```

Amplify Hosting が Git push を検知して自動ビルド・デプロイします。

### エージェントの更新

```bash
cd agents
agentcore deploy --auto-update-on-conflict
```

`--auto-update-on-conflict` を付けると、既存の Runtime 設定（JWT 認証、環境変数など）を維持したまま更新されます。

### 両方を更新する場合

エージェント側を先にデプロイしてください。フロントエンドが新しい API を呼ぶ場合、エージェント側が先に対応している必要があります。

## お片付け（リソース削除）

### Amplify sandbox の停止

```bash
npx ampx sandbox delete
```

sandbox で作成された一時的なバックエンドリソース（AppSync、DynamoDB、Cognito など）が削除されます。

### AgentCore Runtime の削除

```bash
cd agents
agentcore destroy
```

AgentCore Runtime とそれに紐づくリソースが削除されます。

### Amplify Hosting の削除

AWS コンソール → Amplify → アプリを選択 → 「アプリの設定」→「全般」→「アプリを削除」

Cognito User Pool を含むバックエンドリソースも一緒に削除されます。

## ブランチ戦略

| ブランチ | 用途 |
|---------|------|
| `main` | 本番向け |
| `develop` | 統合ブランチ |
| `feature/*` | 実装作業用 |

## デプロイ

Amplify Hosting（フロントエンド + Cognito）と AgentCore Runtime（エージェント）は別々にデプロイします。

### 概要

1. **Amplify Hosting に接続** — GitHub リポジトリを接続し、Cognito User Pool ID と Client ID を控える
2. **AgentCore Runtime にデプロイ**（任意）— `agentcore configure` で JWT 認証を設定し、`agentcore deploy` でデプロイ
3. **環境変数を設定** — Amplify コンソールで `NEXT_PUBLIC_AGENTCORE_RUNTIME_ARN` を設定して再デプロイ

詳細な手順は [docs/deployment.md](docs/deployment.md) を参照してください。

### CI/CD

| 対象 | 担当 | 方法 |
|------|------|------|
| Web アプリ（品質ゲート） | GitHub Actions | lint、型チェック |
| Web アプリ（ビルド・デプロイ） | Amplify Hosting | Git push で自動デプロイ |
| エージェント（品質ゲート） | GitHub Actions | lint、インポート確認（別ワークフロー） |
| エージェント（デプロイ） | AgentCore CLI | `agentcore deploy` で手動デプロイ |

## サンプルページ

`/sample` ページには2つのサンプルが含まれています:

- **Todo リスト** — Amplify Data（AppSync + DynamoDB）との CRUD 連携デモ
- **エージェントチャット** — AgentCore Runtime との HTTP SSE ストリーミング対話デモ

詳細は [docs/sample/](docs/sample/) を参照してください。

### サンプルを除去して開発を始める

テンプレートから自分のプロジェクトを始める際、サンプルコードは以下の手順で除去できます。

**フロントエンド:**

1. `src/app/sample/` を削除
2. `src/components/agent/` を削除
3. `src/hooks/useAgentChat.ts` を削除
4. `src/lib/agent/agentRuntime.ts` を削除
5. `src/app/page.tsx` のフッターから `/sample` へのリンクを削除
6. `amplify/data/resource.ts` の `Todo` モデルを自分のモデルに置き換え

**エージェント（使わない場合）:**

7. `agents/` ディレクトリごと削除

**エージェント（使う場合）:**

7. `agents/sample_agent/` を削除し、新しいエージェントを作成
8. `agents/.bedrock_agentcore.yaml` の `entrypoint` を新しいエージェントのパスに変更（または `agentcore configure` で再設定）
9. `agents/scripts/run_local.py` の import を新しいエージェントに合わせて変更
10. `agents/common/`（config, logging）はそのまま利用可能

**ドキュメント:**

11. `docs/sample/` を削除
12. `README.md` のサンプル関連セクションを書き換え

## 注意事項

- デフォルトの AWS リージョンは `us-west-2`（オレゴン）を想定しています。変更する場合は `.env.local`、`agents/.env`、AWS プロファイルのリージョン設定を合わせてください
- シークレットや認証情報をコミットしない
- テンプレートは汎用的に保つ
- プロジェクト固有のビジネスロジックは、テンプレートから新規リポジトリを作成した後に追加する