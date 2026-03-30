---
name: strands-agent-implementation
description: agents/ 配下の Strands エージェントコードを実装・更新する。新規エージェント作成、ツール追加、AgentCore Runtime 向けエントリーポイント定義、ローカルスモークテストの準備時に使用する。
---

## 目的

- エージェントをモジュール化する
- ツールを明示的に定義する
- ローカル実行を簡単に保つ（AgentCore Runtime 不要）
- AgentCore Runtime 上での実行を前提としたエントリーポイントを定義する
- フロントエンドとの接続は AgentCore Runtime の HTTP POST `/invocations` エンドポイント + SSE ストリーミング経由とする

## ワークフロー

1. エージェントの目的を明確にする
2. 設定、プロンプト、ツール、ランタイムロジックを分離する
3. まず小さな実行可能サンプルを作成する
4. 有用な箇所にログを追加する
5. 隠れた副作用を避ける
6. ローカルでの実行方法を説明する（`run_local.py` で AgentCore 不要の確認）
7. AgentCore Runtime 向けのエントリーポイント（`@app.entrypoint` async generator）を定義する
8. Strands Agents SDK の実装は Power（strands）で最新ドキュメントを確認してから着手する
9. AgentCore Runtime の設定・デプロイは Power（aws-agentcore）で最新ドキュメントを確認する

## デプロイの注意

- Amplify Hosting と AgentCore Runtime は別々にデプロイする
- `agentcore launch` は `.env` を自動反映しない。`update-agent-runtime` で環境変数を設定する
- `agents/` 内に Web UI 層を含めない
- Lambda や API Route でエージェントをラップしない

## 出力の期待事項

- ファイル構成の提示
- ツールの責務の説明
- ランタイム設定の説明
- 最小限のローカル検証手順
- AgentCore Runtime へのデプロイ手順（該当する場合）