# デプロイガイド

Amplify Hosting（フロントエンド + Cognito）と AgentCore Runtime（エージェント）は別々にデプロイします。

## 1. Amplify Hosting（フロントエンド）

### 初回接続

1. AWS コンソールで Amplify を開く
2. 「新しいアプリ」→「GitHub」を選択
3. リポジトリとブランチを選択
4. ビルド設定を確認（`amplify.yml` が自動検出されます）
5. デプロイ

デプロイ完了後、Cognito User Pool が自動作成されます。
Amplify コンソールの「バックエンドの出力」から以下を控えてください:

- **User Pool ID**（例: `us-west-2_xxxxxxxx`）
- **App Client ID**（例: `5nn470ccia55c3skul74mqhced`）

### ブランチ別デプロイ

| ブランチ | 環境 |
|---------|------|
| `main` | 本番 |
| `develop` | ステージング（任意） |

### CI/CD の流れ

```
Push → GitHub Actions（lint / 型チェック）→ Amplify Hosting（ビルド / デプロイ）
```

## 2. AgentCore Runtime（エージェント、任意）

エージェント機能を使う場合のみ必要です。

### 前提条件

- AgentCore CLI（Starter Toolkit）がインストール済み
  ```bash
  pip install bedrock-agentcore-starter-toolkit
  ```
- AWS 認証情報が設定済み
- 手順 1 で Cognito の User Pool ID と App Client ID を控え済み

### 手順

```bash
cd agents
```

#### 2-1. configure

Cognito の情報を使って JWT 認証を設定します。`<User Pool ID>` と `<Client ID>` は手順 1 で控えた値に置き換えてください。

```bash
agentcore configure \
  --entrypoint sample_agent/app.py \
  --name sample_agent \
  --authorizer-config '{"customJWTAuthorizer":{"discoveryUrl":"https://cognito-idp.<region>.amazonaws.com/<User Pool ID>/.well-known/openid-configuration","allowedClients":["<Client ID>"]}}' \
  --region us-west-2
```

対話プロンプトでは以下を選択:
- Deployment type: `Direct Code Deploy`（デフォルト）
- Python runtime: `PYTHON_3_11`（推奨）
- Execution role: Enter（自動作成）
- S3 bucket: Enter（自動作成）
- Memory: Enter（STM のみ、デフォルト）

#### 2-2. deploy

```bash
agentcore deploy
```

CodeBuild がクラウド上でビルドします（数分かかります）。

#### 2-3. 確認

```bash
agentcore status
```

ステータスが `READY` になれば成功です。出力に表示される **Agent ARN** を控えてください。

## 3. フロントエンドに Runtime ARN を設定

Amplify コンソール → アプリ → ホスティング → 環境変数:

| キー | 値 |
|------|-----|
| `NEXT_PUBLIC_AGENTCORE_RUNTIME_ARN` | 手順 2-3 で取得した ARN |

設定後、再デプロイ（再ビルドをトリガー、または Git push）すれば `/sample` ページのエージェントチャットが接続可能になります。

## 注意事項

- 環境変数は Amplify コンソールで設定してください（シークレットをリポジトリにコミットしない）
- `agentcore configure` で `--authorizer-config` を省略すると JWT 認証設定がリセットされます。環境変数を更新する際も毎回含めてください
- Amplify のビルド環境は Docker 非対応のため、AgentCore Runtime を Amplify の CDK スタックに含めないでください
- sandbox の Cognito と AgentCore Runtime の Cognito は異なるため、sandbox 環境での結合テストは不可です。結合テストは Amplify develop 環境で行ってください

## 4. プログラム更新時のデプロイ

### フロントエンドの更新

```bash
git add -A
git commit -m "変更内容の説明"
git push origin <ブランチ名>
```

Amplify Hosting が Git push を検知して自動ビルド・デプロイします。環境変数の変更がなければ追加作業は不要です。

### エージェントの更新

```bash
cd agents
agentcore deploy --auto-update-on-conflict
```

`--auto-update-on-conflict` を付けると、既存の Runtime 設定（JWT 認証、環境変数など）を維持したまま更新されます。省略すると authorizer 設定がリセットされる可能性があるので注意してください。

### 両方を更新する場合

エージェント側を先にデプロイしてください。フロントエンドが新しい API を呼ぶ場合、エージェント側が先に対応している必要があります。

1. `cd agents && agentcore deploy --auto-update-on-conflict`
2. `git push` でフロントエンドをデプロイ

### エージェントの環境変数を更新する場合

```bash
aws bedrock-agentcore update-agent-runtime \
  --agent-runtime-name <runtime-name> \
  --environment-variables '{"MODEL_ID":"...","EXTERNAL_API_KEY":"..."}'
```

`--authorizer-configuration` を省略すると JWT 認証設定がリセットされます。環境変数のみ更新する場合も、既存の authorizer 設定を含めて指定してください。

## 5. お片付け（リソース削除）

不要になったリソースを削除する手順です。

### Amplify sandbox の停止

開発中に作成した sandbox 環境を削除します。

```bash
npx ampx sandbox delete
```

sandbox で作成された一時的なバックエンドリソース（AppSync、DynamoDB、Cognito など）が削除されます。

### AgentCore Runtime の削除

```bash
cd agents
agentcore destroy
```

AgentCore Runtime とそれに紐づくリソース（CodeBuild プロジェクト、S3 アーティファクトなど）が削除されます。

ただし Memory リソースは `agentcore destroy` では削除されません（意図的に保持される仕様）。不要な場合は手動で削除してください:

```bash
# Memory リソースの確認
aws bedrock-agentcore-control list-memories --region us-west-2

# Memory リソースの削除
aws bedrock-agentcore-control delete-memory --memory-id <memory-id> --region us-west-2
```

### Amplify Hosting の削除

1. AWS コンソール → Amplify → アプリを選択
2. 「アプリの設定」→「全般」→「アプリを削除」

Cognito User Pool を含むバックエンドリソースも一緒に削除されます。

### 削除順序

依存関係を考慮して以下の順序で削除してください:

1. AgentCore Runtime（`agentcore destroy`）— Cognito への参照を先に解除
2. Amplify Hosting（コンソールから削除）— Cognito User Pool を含むバックエンドを削除
3. sandbox（`npx ampx sandbox delete`）— 開発用の一時リソースを削除（まだ残っている場合）