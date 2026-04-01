#!/bin/bash
# AgentCore Runtime 環境変数設定スクリプト
#
# 使い方:
#   1. .env.runtime を作成（.env.runtime.example を参考に）
#   2. ./scripts/set_env.sh
#
# agentcore deploy 後に毎回実行してください。
# deploy が環境変数をリセットする場合があるためです。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENTS_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${AGENTS_DIR}/.env.runtime"
REGION="${AWS_REGION:-us-west-2}"

if [ ! -f "$ENV_FILE" ]; then
  echo "エラー: ${ENV_FILE} が見つかりません。"
  echo ".env.runtime.example を参考に作成してください。"
  exit 1
fi

# Runtime ID を取得
RUNTIME_ID=$(aws bedrock-agentcore-control list-agent-runtimes \
  --region "$REGION" \
  --query "agentRuntimes[?agentRuntimeName=='jp_stock_agent'].agentRuntimeId | [0]" \
  --output text 2>/dev/null)

if [ -z "$RUNTIME_ID" ] || [ "$RUNTIME_ID" = "None" ]; then
  echo "エラー: jp_stock_agent の Runtime が見つかりません。"
  exit 1
fi

echo "Runtime ID: ${RUNTIME_ID}"

# 現在の設定を取得
CURRENT=$(aws bedrock-agentcore-control get-agent-runtime \
  --agent-runtime-id "$RUNTIME_ID" \
  --region "$REGION" 2>/dev/null)

# 現在の環境変数をベースに .env.runtime の値をマージ
ENV_JSON=$(python3 -c "
import json, sys

# 現在の環境変数
current = json.loads('''${CURRENT}''').get('environmentVariables', {})

# .env.runtime から読み込み
with open('${ENV_FILE}') as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' in line:
            key, _, value = line.partition('=')
            current[key.strip()] = value.strip()

print(json.dumps(current))
")

echo "設定する環境変数:"
echo "$ENV_JSON" | python3 -m json.tool

# update-agent-runtime 用の JSON を構築
ARTIFACT=$(echo "$CURRENT" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['agentRuntimeArtifact']))")
ROLE_ARN=$(echo "$CURRENT" | python3 -c "import json,sys; print(json.load(sys.stdin)['roleArn'])")
NETWORK=$(echo "$CURRENT" | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['networkConfiguration']))")
AUTH=$(echo "$CURRENT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d.get('authorizerConfiguration',{})))")

# JSON ファイルに書き出して実行
TMPFILE=$(mktemp)
python3 -c "
import json
payload = {
    'agentRuntimeId': '${RUNTIME_ID}',
    'agentRuntimeArtifact': json.loads('${ARTIFACT}'),
    'roleArn': '${ROLE_ARN}',
    'networkConfiguration': json.loads('${NETWORK}'),
    'environmentVariables': json.loads('${ENV_JSON}'),
    'authorizerConfiguration': json.loads('${AUTH}'),
}
with open('${TMPFILE}', 'w') as f:
    json.dump(payload, f)
"

aws bedrock-agentcore-control update-agent-runtime \
  --cli-input-json "file://${TMPFILE}" \
  --region "$REGION"

rm -f "$TMPFILE"

echo ""
echo "環境変数の設定が完了しました。"
echo "ステータスが READY になるまで数分お待ちください。"
