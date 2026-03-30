"""ローカル実行スクリプト

サンプルエージェントを対話的に実行します。

使い方:
    cd agents
    python scripts/run_local.py
"""

import sys
from pathlib import Path

# agents/ をモジュール検索パスに追加
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.logging import setup_logger
from sample_agent.agent import create_agent

logger = setup_logger("run_local")


def main() -> None:
    """エージェントを起動してテストメッセージを送信する"""
    logger.info("サンプルエージェントを起動します")
    agent = create_agent()

    test_message = "今の時刻を教えてください。"
    logger.info("テストメッセージ: %s", test_message)

    response = agent(test_message)
    print(f"\n応答:\n{response}")


if __name__ == "__main__":
    main()
