"""サンプルエージェント用ツール

エージェントが使用するツール関数を定義します。
"""

from datetime import datetime, timezone

from strands import tool


@tool
def current_time() -> str:
    """現在の UTC 時刻を返す"""
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%d %H:%M:%S UTC")
