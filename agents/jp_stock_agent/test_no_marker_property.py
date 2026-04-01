"""Property 3: エージェント出力にJSONマーカーを含まないことを検証するプロパティテスト

**Validates: Requirements 5.1, 5.2**
"""

from unittest.mock import MagicMock, patch

import pandas as pd
from hypothesis import given, settings
from hypothesis import strategies as st

from jp_stock_agent.tools import get_stock_prices


def _make_mock_ticker(ticker_code: str) -> MagicMock:
    """yfinance.Ticker のモックを生成する。"""
    mock_ticker = MagicMock()
    mock_ticker.info = {
        "longName": f"テスト企業_{ticker_code}",
        "shortName": f"Test_{ticker_code}",
    }

    # 20日分のリアルなOHLCVデータを生成
    dates = pd.bdate_range(start="2024-01-01", periods=20)
    df = pd.DataFrame(
        {
            "Open": [1000.0 + i * 10 for i in range(20)],
            "High": [1050.0 + i * 10 for i in range(20)],
            "Low": [950.0 + i * 10 for i in range(20)],
            "Close": [1020.0 + i * 10 for i in range(20)],
            "Volume": [100000 + i * 1000 for i in range(20)],
        },
        index=dates,
    )
    mock_ticker.history.return_value = df
    return mock_ticker


# 4桁の銘柄コードを生成するストラテジー
ticker_code_strategy = st.from_regex(r"[0-9]{4}", fullmatch=True)


@given(ticker_code=ticker_code_strategy)
@settings(max_examples=100)
def test_no_json_marker_in_output(ticker_code: str):
    """Feature: stock-chart-prefetch, Property 3: No JSON marker in agent output

    ランダムな銘柄コードに対して変更後のget_stock_prices出力に
    JSONマーカーが含まれないことを検証する。

    **Validates: Requirements 5.1, 5.2**
    """
    mock_ticker = _make_mock_ticker(ticker_code)

    with patch("jp_stock_agent.tools.yf.Ticker", return_value=mock_ticker):
        result = get_stock_prices(ticker_code=ticker_code)

    assert "<!--STOCK_DATA_JSON-->" not in result, (
        f"出力にJSONマーカー開始タグが含まれています: ticker_code={ticker_code}"
    )
    assert "<!--/STOCK_DATA_JSON-->" not in result, (
        f"出力にJSONマーカー終了タグが含まれています: ticker_code={ticker_code}"
    )
