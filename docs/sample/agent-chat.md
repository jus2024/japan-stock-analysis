# エージェントチャット

サンプルページの下部に配置された AgentCore Runtime との対話デモです。

## 概要

Cognito 認証済みユーザーが、HTTP POST + Server-Sent Events (SSE) で AgentCore Runtime 上のエージェントとリアルタイムに対話できるチャット UI です。エージェントの応答はトークン単位でストリーミング表示されます。

## アーキテクチャ

```
ブラウザ (useAgentChat)
  │
  ├─ 1. fetchAuthSession() → Cognito JWT 取得
  │
  ├─ 2. POST /runtimes/{arn}/invocations
  │     Authorization: Bearer {token}
  │     X-Amzn-Bedrock-AgentCore-Runtime-Session-Id: {uuid}
  │     Body: {"prompt": "..."}
  │
  └─ 3. SSE レスポンス受信（text/event-stream）
        data: {"chunk": "テキスト断片"}
        data: [DONE]
```

## 通信方式

HTTP POST でリクエストを送信し、レスポンスを SSE ストリームとして受信します。

| 項目 | 値 |
|------|-----|
| プロトコル | HTTPS |
| メソッド | POST |
| エンドポイント | `https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{arn}/invocations?qualifier=DEFAULT` |
| 認証 | `Authorization: Bearer {JWT}` |
| セッション管理 | `X-Amzn-Bedrock-AgentCore-Runtime-Session-Id: {UUID v4}` |
| レスポンス形式 | Server-Sent Events（`data:` 行の JSON `chunk` フィールド） |

## セッション管理

- セッション ID は `useAgentChat` フック初期化時に `crypto.randomUUID()` で生成
- 同一マウント中はすべてのリクエストに同じセッション ID を使用
- フック再マウント時に新しいセッション ID が生成される
- これにより AgentCore Runtime 側で会話コンテキストが維持される

## ストリーミング

エージェント側（`app.py`）は Strands SDK の `callback_handler` を使い、モデルからのテキストチャンクを `asyncio.Queue` 経由で async generator に流します。AgentCore Runtime が各 `yield` を SSE イベントに変換し、フロントエンドの `readSSEStream` が逐次パースして UI に反映します。

## エラーハンドリング

| エラー種別 | 条件 | UI 表示 |
|-----------|------|---------|
| Runtime 未設定 | `NEXT_PUBLIC_AGENTCORE_RUNTIME_ARN` が空 | 入力無効化 + 案内メッセージ |
| 認証エラー | `fetchAuthSession()` 失敗 | 「認証情報を取得できません」 |
| HTTP エラー | 非 2xx レスポンス | `HTTP {status}: {statusText}` |
| SSE エラー | ストリーム中の `error` フィールド | エラー内容を表示 |
| キャンセル | コンポーネントアンマウント | `AbortController.abort()` で静かに終了 |

## 関連ファイル

| ファイル | 役割 |
|---------|------|
| `src/components/agent/AgentChatSection.tsx` | チャット UI セクション |
| `src/components/agent/MessageList.tsx` | メッセージ一覧表示 |
| `src/components/agent/MessageInput.tsx` | メッセージ入力フォーム |
| `src/hooks/useAgentChat.ts` | 通信・状態管理フック |
| `src/lib/agent/agentRuntime.ts` | URL 構築・HTTP POST・SSE パース |
| `src/types/index.ts` | `ChatMessage` 型定義 |
| `agents/sample_agent/app.py` | エージェント側エントリーポイント |
| `agents/sample_agent/agent.py` | エージェント生成（Strands SDK） |

## 前提条件

- `NEXT_PUBLIC_AGENTCORE_RUNTIME_ARN` 環境変数が設定されていること
- AgentCore Runtime がデプロイ済みで、Cognito JWT 認証が設定されていること
- ユーザーが Cognito でログイン済みであること

## カスタマイズ

- エージェントのシステムプロンプトやツールは `agents/sample_agent/agent.py` で変更
- チャット UI のスタイルは `AgentChatSection.tsx` と `sample.module.css` で調整
- `useAgentChat` フックは他のページでも再利用可能