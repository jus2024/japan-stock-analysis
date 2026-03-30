"""エージェント共通設定"""

import os
from pathlib import Path

from dotenv import load_dotenv

# agents/ ディレクトリの .env を読み込む
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)


def get_model_id() -> str:
    """使用するモデル ID を取得する"""
    return os.getenv("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")


def get_aws_region() -> str:
    """AWS リージョンを取得する"""
    return os.getenv("AWS_REGION", "us-west-2")
