# Strands Agents（オプション拡張）

このディレクトリは、Strands Agents SDK を使った AI エージェント機能のオプション拡張用です。
業務 Web アプリ本体（`src/`）とは独立しており、エージェント機能が不要なプロジェクトでは無視して構いません。

エージェントは Amazon Bedrock AgentCore Runtime 上での実行を前提としています。

## ディレクトリ構成

```
agents/
  common/           # エージェント共通処理（設定、ログ）
  sample_agent/     # 最小サンプルエージェント
  scripts/          # ローカル実行スクリプト
  pyproject.toml    # Python プロジェクト定義
  .env.example      # 環境変数テンプレート
```

## セットアップ

```bash
cd agents
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

## 環境変数

```bash
cp .env.example .env
# .env を編集して必要な値を設定
```

## ローカル開発

```bash
# AgentCore Runtime 不要のローカル動作確認
python scripts/run_local.py
```

ローカル実行では AgentCore Runtime を使わず、エージェントのロジックとツールを直接テストできます。

## デプロイ（AgentCore Runtime）

エージェントを本番環境にデプロイするには AgentCore CLI（Starter Toolkit）を使用します。

```bash
# 初回設定
agentcore configure

# ビルド & デプロイ
agentcore deploy

# 環境変数の設定（JWT 認証含む）
# 注意: --authorizer-configuration を省略すると JWT 設定がリセットされます
aws bedrock-agentcore update-agent-runtime \
  --agent-runtime-name <runtime-name> \
  --environment-variables '{"MODEL_ID":"...","EXTERNAL_API_KEY":"..."}'
```

### デプロイ時の注意

- `agentcore launch` は `.env` の内容を Runtime に自動反映しません
- 環境変数を更新する際は、既存の全設定（role-arn, artifact, network, authorizer）を含めて指定してください
- Amplify Hosting と AgentCore Runtime は別々にデプロイします
- Amplify のビルド環境は Docker 非対応のため、AgentCore を Amplify の CDK スタックに含めないでください

### 環境分離

- 開発環境と本番環境で AgentCore Runtime を分けてください（例: `my_agent_dev`, `my_agent_prod`）
- Cognito User Pool は Amplify がブランチごとに分離するため、AgentCore の JWT 設定も環境ごとに異なります
- フロントエンド結合テストは Amplify develop 環境で行ってください（sandbox の Cognito と AgentCore の Cognito が異なるため）

## フロントエンドとの接続

- フロントエンドとエージェントの接続は AgentCore Runtime の HTTP POST `/invocations` エンドポイント + SSE ストリーミング経由です
- エントリーポイントは `BedrockAgentCoreApp` の `@app.entrypoint`（async generator）で定義します
- `agents/` 内に Web UI 層（API エンドポイント、HTML テンプレート）を含めないでください
- Amplify コンソールで `NEXT_PUBLIC_AGENTCORE_RUNTIME_ARN` を設定してフロントエンドから接続します

## 注意事項

- Python 3.10 以上が必要です
- シークレットは `.env` に記載し、コミットしないでください
- AWS 認証情報は環境変数または AWS プロファイルで設定してください