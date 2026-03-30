---
inclusion: fileMatch
fileMatchPattern: "src/**/*"
---

# フロントエンド方針

- TypeScript を一貫して使用する
- 小さく合成可能なコンポーネントと機能単位の構成を優先する
- UI ロジックとインフラ関連処理を可能な限り分離する
- UI コードとオプションのエージェントランタイムコードの密結合を避ける
- バックエンド生成アーティファクトへの依存がある場合は文書化する

# AgentCore Runtime との接続に関する注意

- AgentCore Runtime の Invocation URL は `https://bedrock-agentcore.<region>.amazonaws.com/runtimes/<url-encoded-arn>/invocations?qualifier=DEFAULT` である
- 認証は `Authorization: Bearer <token>` ヘッダーで行う（標準的な HTTP 認証方式）
- セッション管理は `X-Amzn-Bedrock-AgentCore-Runtime-Session-Id` ヘッダーに UUID v4 を付与する
- レスポンスは SSE（Server-Sent Events）形式で、`data: {"chunk": "..."}` 行でテキストチャンクが逐次届く
- エージェントからのレスポンスは必ず文字列であることを前提とする。オブジェクトが返ってきた場合は React が描画エラーを起こす
- `AbortController` でリクエストキャンセルに対応する（コンポーネントアンマウント時）