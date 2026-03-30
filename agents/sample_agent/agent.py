"""サンプルエージェント

最小構成のエージェント実装例です。
プロジェクトに合わせてカスタマイズしてください。
"""

from strands import Agent

from common.config import get_model_id
from common.logging import setup_logger
from sample_agent.tools import current_time

logger = setup_logger("sample_agent")


def create_agent() -> Agent:
    """サンプルエージェントを生成する"""
    model_id = get_model_id()
    logger.info("エージェントを作成します（モデル: %s）", model_id)

    agent = Agent(
        system_prompt="あなたは親切なアシスタントです。日本語で回答してください。",
        tools=[current_time],
    )
    return agent
