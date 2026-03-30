---
inclusion: always
---

# リポジトリ構成

想定構成:
- `src/` : Web アプリケーション本体
- `amplify/` : Amplify Gen 2 バックエンド定義
- `agents/` : オプションの Strands エージェント
- `.kiro/` : Kiro ワークスペース設定
- `.github/` : CI/CD とリポジトリテンプレート

ルール:
- 明示的に依頼されない限り、主要ディレクトリを移動しない
- エージェントコードは Web アプリのパスから分離する
- エージェント共通処理は `agents/common/` に配置する
- 実行可能なサンプルは `agents/sample_agent/` に配置する
- `agents/` に Web UI 層（API エンドポイント、HTML、フロントエンド）を含めない
- `src/` にエージェントのランタイムロジック（Python コード、エージェント定義）を含めない
- フロントエンドとエージェントの接続は AgentCore Runtime のエンドポイント経由とする