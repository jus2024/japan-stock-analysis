---
inclusion: fileMatch
fileMatchPattern: "agents/**/*"
---

# Strands エージェント方針

- Python 3.10 以上互換のコードを書く
- エージェントはモジュール化し、ツールは明示的に定義する
- 隠れた副作用を避ける
- ログによる観測可能なランタイム動作を優先する
- 設定、プロンプト、ツール、ランタイムロジックを分離する
- ローカル実行を簡単かつ再現可能に保つ
- `agents/` はオプションのプロジェクト拡張コードであり、アプリの中心ではない

# Strands SDK の実装上の注意

- `agent(prompt)` の戻り値は `AgentResult` オブジェクトである
- `AgentResult.message` は Bedrock Converse API 形式の dict（`{"role": "assistant", "content": [{"text": "..."}]}`）であり、文字列ではない
- テキスト応答を取得するには `str(result)` を使う（`AgentResult.__str__()` がテキストブロックを結合した文字列を返す）
- `result.message` を直接 JSON レスポンスに含めると、フロントエンドでオブジェクトを文字列として描画しようとしてエラーになる

# AgentCore Runtime 前提

- エージェントは Amazon Bedrock AgentCore Runtime 上での実行を前提とする
- エントリーポイントは `BedrockAgentCoreApp` の `@app.entrypoint` で定義する（async generator として `yield` でストリーミング）
- `agents/` 内に Web UI 層（API エンドポイント、HTML テンプレート、フロントエンドコード）を含めない
- フロントエンドとエージェントの接続は AgentCore Runtime の HTTP POST `/invocations` エンドポイント経由とする
- Lambda 関数や API Route でエージェントをラップするパターンは使わない

# AgentCore Runtime HTTP SSE 通信の実装上の注意

- Invocation URL 形式: `https://bedrock-agentcore.<region>.amazonaws.com/runtimes/<url-encoded-arn>/invocations?qualifier=DEFAULT`
- 認証は標準の `Authorization: Bearer <token>` ヘッダーを使用する
- セッション管理は `X-Amzn-Bedrock-AgentCore-Runtime-Session-Id` ヘッダーに UUID v4 を付与する
- リクエストボディは `{"prompt": "..."}` 形式の JSON
- レスポンスは SSE（Server-Sent Events）形式で、`data: {"chunk": "..."}` 行でテキストチャンクが届く
- エージェント側は `callback_handler` でテキストチャンクを `asyncio.Queue` に流し、async generator で逐次 `yield` する
- agentcore CLI のコマンドは `agentcore deploy`（`agentcore launch` はエイリアス）
- `agentcore configure` の `--authorizer-config` は `{"customJWTAuthorizer": {"discoveryUrl": "...", "allowedClients": ["..."]}}` 形式（トップレベルに `type` を含めない）

# デプロイ方針

Amplify Hosting と AgentCore Runtime は別々にデプロイする:

- Amplify Hosting: フロントエンド + Cognito（Git push で自動デプロイ）
- AgentCore Runtime: `agentcore CLI`（Starter Toolkit）で手動デプロイ
- Amplify Hosting のビルド環境は Docker 非対応のため、AgentCore Runtime を Amplify の CDK スタックに含めない

デプロイ手順:
1. Amplify Hosting にリポジトリを接続 → Cognito User Pool が自動作成される
2. `agentcore configure` で JWT 認証に Cognito の User Pool ID と Client ID を設定
3. `agentcore launch` でビルド & デプロイ
4. `update-agent-runtime` で環境変数（MODEL_ID, 外部 API キー等）を設定
5. Amplify コンソールで `NEXT_PUBLIC_AGENTCORE_RUNTIME_ARN` を設定 → 再デプロイ

環境変数の注意:
- `agentcore launch` は `agents/.env` の内容を Runtime に自動反映しない
- `update-agent-runtime` で `--authorizer-configuration` を省略すると JWT 認証設定がリセットされる
- 環境変数を更新する際は、既存の全設定（role-arn, artifact, network, authorizer）を含めて指定する

環境分離:
- 開発環境と本番環境で AgentCore Runtime を分ける（例: `jp_stock_agent_dev`, `jp_stock_agent_prod`）
- Cognito User Pool は Amplify がブランチごとに分離するため、AgentCore の JWT 設定も環境ごとに異なる
- ローカル開発でのエージェント動作確認は `run_agentcore_local.py` を使用（Runtime 不要）
- フロントエンド結合テストは Amplify develop 環境で行う（サンドボックスの Cognito と AgentCore の Cognito が異なるため）

# ドキュメント確認

- Strands Agents SDK の実装は、Power（strands）で最新ドキュメントを確認してから着手する
- AgentCore Runtime の設定・デプロイは、Power（aws-agentcore）で最新ドキュメントを確認してから着手する
- Amplify Gen 2 との統合は、Power（aws-amplify）または AWS MCP で最新ドキュメントを確認する