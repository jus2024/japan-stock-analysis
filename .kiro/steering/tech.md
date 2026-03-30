---
inclusion: always
---

# 技術方針

主要スタック:
- フロントエンド: Next.js + TypeScript
- バックエンド: AWS Amplify Gen 2
- エージェント（任意）: Python + Strands Agents SDK
- エージェント実行基盤（任意）: Amazon Bedrock AgentCore Runtime
- リポジトリ: GitHub
- デプロイ先（Web）: Amplify Hosting
- デプロイ先（エージェント）: AgentCore Runtime（agentcore CLI）

技術ルール:
- フロントエンドと Amplify バックエンド定義には TypeScript を使用する
- Python は `agents/` 内でのみ使用する
- エージェントのランタイム関連処理は Web アプリ本体から分離する
- 暗黙の規約より、明示的で読みやすい設定を優先する
