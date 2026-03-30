# セットアップガイド

## 前提条件

- Node.js 20 以上
- npm
- AWS アカウントと認証情報
- Git

## Web アプリのセットアップ

```bash
# リポジトリのクローン
git clone <リポジトリURL>
cd <プロジェクト名>

# 依存関係のインストール
npm ci

# 環境変数の設定
cp .env.example .env.local
# .env.local を編集

# Amplify sandbox の起動（バックエンド開発用）
npx ampx sandbox

# 開発サーバーの起動（別ターミナルで）
npm run dev
```

## エージェントのセットアップ（任意）

```bash
cd agents
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

cp .env.example .env
# .env を編集
```

## 注意事項

- `.env.local` や `agents/.env` はコミットしないでください
- Amplify sandbox は開発用の一時的なバックエンド環境を作成します
