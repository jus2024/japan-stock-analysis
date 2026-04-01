"""get_stock_prices ツールのユニットテスト（マーカー削除後の出力確認）"""

from unittest.mock import MagicMock, patch

import pandas as pd

from jp_stock_agent.tools import get_stock_prices


def _make_mock_ticker(ticker_code: str, *, empty: bool = False) -> MagicMock:
    """yfinance.Ticker のモックを生成する。

    test_no_marker_property.py と同じパターンを使用。
    """
    mock_ticker = MagicMock()
    mock_ticker.info = {
        "longName": f"テスト企業_{ticker_code}",
        "shortName": f"Test_{ticker_code}",
    }

    if empty:
        mock_ticker.history.return_value = pd.DataFrame()
        return mock_ticker

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


class TestGetStockPricesNoMarkers:
    """マーカーが出力に含まれないことを確認するテスト"""

    def test_no_json_markers_in_output(self):
        """有効な銘柄コードで呼び出した場合、出力にJSONマーカーが含まれない"""
        mock_ticker = _make_mock_ticker("7203")

        with patch("jp_stock_agent.tools.yf.Ticker", return_value=mock_ticker):
            result = get_stock_prices(ticker_code="7203")

        assert "<!--STOCK_DATA_JSON-->" not in result
        assert "<!--/STOCK_DATA_JSON-->" not in result


class TestGetStockPricesTechnicalSummary:
    """テクニカル要約テキストの内容確認テスト"""

    def test_contains_company_name_and_ticker(self):
        mock_ticker = _make_mock_ticker("7203")

        with patch("jp_stock_agent.tools.yf.Ticker", return_value=mock_ticker):
            result = get_stock_prices(ticker_code="7203")

        assert "銘柄:" in result
        assert "7203" in result

    def test_contains_closing_price(self):
        mock_ticker = _make_mock_ticker("7203")

        with patch("jp_stock_agent.tools.yf.Ticker", return_value=mock_ticker):
            result = get_stock_prices(ticker_code="7203")

        assert "直近終値:" in result

    def test_contains_moving_averages(self):
        mock_ticker = _make_mock_ticker("7203")

        with patch("jp_stock_agent.tools.yf.Ticker", return_value=mock_ticker):
            result = get_stock_prices(ticker_code="7203")

        assert "5日MA:" in result

    def test_contains_period_info(self):
        mock_ticker = _make_mock_ticker("7203")

        with patch("jp_stock_agent.tools.yf.Ticker", return_value=mock_ticker):
            result = get_stock_prices(ticker_code="7203")

        assert "期間:" in result

    def test_contains_price_change_rate(self):
        mock_ticker = _make_mock_ticker("7203")

        with patch("jp_stock_agent.tools.yf.Ticker", return_value=mock_ticker):
            result = get_stock_prices(ticker_code="7203")

        assert "期間騰落率:" in result


class TestGetStockPricesErrorCases:
    """エラーケースのテスト"""

    def test_empty_ticker_code(self):
        result = get_stock_prices(ticker_code="")

        assert "エラー" in result

    def test_ticker_not_found(self):
        mock_ticker = _make_mock_ticker("9999", empty=True)

        with patch("jp_stock_agent.tools.yf.Ticker", return_value=mock_ticker):
            result = get_stock_prices(ticker_code="9999")

        assert "エラー" in result
