---
inclusion: always
---

# テスト方針

- 最も狭い範囲の検証を最初に実行する
- フロントエンド変更は lint と型チェックを優先する
- Amplify 変更はデプロイと設定への影響を記載する
- エージェント変更はスモークテストとインポート確認を優先する
- CI は明らかな問題で早期に失敗させる

# エージェントのテスト環境に関する注意

- ローカルでのエージェント動作確認は `run_local.py` を使用する（AgentCore Runtime 不要）
- フロントエンドとエージェントの結合テストは Amplify develop 環境で行う
- sandbox の Cognito と AgentCore Runtime の Cognito は異なるため、sandbox 環境での結合テストは不可
