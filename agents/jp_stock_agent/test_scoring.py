"""スコアリングロジックのユニットテスト"""

import pytest

from jp_stock_agent.scoring import (
    calculate_fundamentals_score,
    calculate_news_score,
    calculate_peer_score,
    calculate_technical_score,
    calculate_total_score,
    get_judgment_label,
)

# ---------------------------------------------------------------------------
# get_judgment_label
# ---------------------------------------------------------------------------

class TestGetJudgmentLabel:
    """投資判断ラベルのテスト"""

    @pytest.mark.parametrize("score,expected", [
        (0, "弱気"),
        (10, "弱気"),
        (20, "弱気"),
        (21, "やや弱気"),
        (30, "やや弱気"),
        (40, "やや弱気"),
        (41, "中立"),
        (50, "中立"),
        (60, "中立"),
        (61, "やや強気"),
        (70, "やや強気"),
        (80, "やや強気"),
        (81, "強気"),
        (90, "強気"),
        (100, "強気"),
    ])
    def test_label_boundaries(self, score: int, expected: str):
        assert get_judgment_label(score) == expected

    def test_monotonicity(self):
        """スコアが上がるとラベルが同じかよりポジティブになる（単調性）"""
        label_order = ["弱気", "やや弱気", "中立", "やや強気", "強気"]
        prev_idx = -1
        for score in range(0, 101):
            label = get_judgment_label(score)
            idx = label_order.index(label)
            assert idx >= prev_idx, (
                f"単調性違反: score={score}, label={label}"
            )
            prev_idx = idx


# ---------------------------------------------------------------------------
# calculate_total_score
# ---------------------------------------------------------------------------

class TestCalculateTotalScore:
    """総合スコア算出のテスト"""

    def test_sum_equals_total(self):
        total, label = calculate_total_score(20, 15, 10, 15)
        assert total == 60
        assert label == "中立"

    def test_all_zero(self):
        total, label = calculate_total_score(0, 0, 0, 0)
        assert total == 0
        assert label == "弱気"

    def test_all_max(self):
        total, label = calculate_total_score(30, 25, 20, 25)
        assert total == 100
        assert label == "強気"

    def test_clamping_over_max(self):
        """各カテゴリが上限を超えた場合にクランプされる"""
        total, _ = calculate_total_score(50, 50, 50, 50)
        assert total == 100

    def test_clamping_negative(self):
        """負の値はクランプされる"""
        total, _ = calculate_total_score(-10, -5, -3, -2)
        assert total == 0


# ---------------------------------------------------------------------------
# calculate_fundamentals_score
# ---------------------------------------------------------------------------

class TestCalculateFundamentalsScore:
    """ファンダメンタルズスコアのテスト"""

    def test_empty_metrics(self):
        score, _ = calculate_fundamentals_score({})
        assert score == 0

    def test_all_none_metrics(self):
        data = {"metrics": {"per": None, "pbr": None, "roe": None,
                            "dividend_yield": None, "equity_ratio": None}}
        score, _ = calculate_fundamentals_score(data)
        assert score == 0

    def test_good_fundamentals(self):
        data = {"metrics": {
            "per": 8.0,       # < 10 → 8点
            "pbr": 0.8,       # < 1.0 → 6点
            "roe": 16.0,      # >= 15 → 8点
            "dividend_yield": 4.5,  # >= 4.0 → 4点
            "equity_ratio": 65.0,   # >= 60 → 4点
        }}
        score, _ = calculate_fundamentals_score(data)
        assert score == 30  # 8+6+8+4+4 = 30

    def test_score_in_range(self):
        data = {"metrics": {
            "per": 15.0,
            "pbr": 1.2,
            "roe": 7.0,
            "dividend_yield": 2.0,
            "equity_ratio": 45.0,
        }}
        score, _ = calculate_fundamentals_score(data)
        assert 0 <= score <= 30


# ---------------------------------------------------------------------------
# calculate_technical_score
# ---------------------------------------------------------------------------

class TestCalculateTechnicalScore:
    """テクニカルスコアのテスト"""

    def test_empty_prices(self):
        score, _ = calculate_technical_score({})
        assert score == 0

    def test_insufficient_data(self):
        score, _ = calculate_technical_score({"prices": [{"close": 100}]})
        assert score == 0

    def test_bullish_signals(self):
        """強気シグナルが多い場合、高スコアになる"""
        prices = []
        # 20日分のデータを生成（上昇トレンド）
        for i in range(25):
            prices.append({
                "date": f"2024-01-{i+1:02d}",
                "close": 1000 + i * 20,
                "ma5": 1000 + i * 18,
                "ma25": 1000 + i * 10,
                "ma75": 900 + i * 5,
                "ma200": 800 + i * 2,
            })
        score, _ = calculate_technical_score({"prices": prices})
        assert 0 <= score <= 25
        assert score > 12  # 強気シグナルなので中立以上

    def test_score_in_range(self):
        prices = [
            {"date": "2024-01-01", "close": 1000, "ma5": 990, "ma25": 980,
             "ma75": 970, "ma200": 960},
            {"date": "2024-01-02", "close": 1010, "ma5": 995, "ma25": 985,
             "ma75": 975, "ma200": 965},
        ]
        score, _ = calculate_technical_score({"prices": prices})
        assert 0 <= score <= 25


# ---------------------------------------------------------------------------
# calculate_news_score
# ---------------------------------------------------------------------------

class TestCalculateNewsScore:
    """IR・ニューススコアのテスト"""

    def test_no_news(self):
        score, _ = calculate_news_score({"news": []})
        assert score == 10  # 中立

    def test_all_positive(self):
        data = {
            "news": [{"impact": "ポジティブ"}] * 5,
            "impact_summary": {"ポジティブ": 5, "ネガティブ": 0, "ニュートラル": 0},
        }
        score, _ = calculate_news_score(data)
        assert score == 20

    def test_all_negative(self):
        data = {
            "news": [{"impact": "ネガティブ"}] * 5,
            "impact_summary": {"ポジティブ": 0, "ネガティブ": 5, "ニュートラル": 0},
        }
        score, _ = calculate_news_score(data)
        assert score == 0

    def test_mixed_news(self):
        data = {
            "news": [{"impact": "ポジティブ"}, {"impact": "ネガティブ"},
                     {"impact": "ニュートラル"}],
            "impact_summary": {"ポジティブ": 1, "ネガティブ": 1, "ニュートラル": 1},
        }
        score, _ = calculate_news_score(data)
        assert score == 10  # 均等 → 中立

    def test_score_in_range(self):
        data = {
            "news": [{"impact": "ポジティブ"}] * 3 + [{"impact": "ネガティブ"}],
        }
        score, _ = calculate_news_score(data)
        assert 0 <= score <= 20


# ---------------------------------------------------------------------------
# calculate_peer_score
# ---------------------------------------------------------------------------

class TestCalculatePeerScore:
    """同業種比較スコアのテスト"""

    def test_no_peers(self):
        score, _ = calculate_peer_score({"target_metrics": {}, "peers": []})
        assert score == 12  # 中立

    def test_outperforming_peers(self):
        """同業種より優れた指標の場合、高スコアになる"""
        data = {
            "target_metrics": {
                "per": 8.0,    # 割安
                "roe": 20.0,   # 高ROE
                "pbr": 0.7,    # 割安
                "dividend_yield": 5.0,  # 高配当
            },
            "peers": [
                {"per": 15.0, "roe": 10.0, "pbr": 1.5, "dividend_yield": 2.0},
                {"per": 18.0, "roe": 8.0, "pbr": 1.8, "dividend_yield": 1.5},
                {"per": 12.0, "roe": 12.0, "pbr": 1.2, "dividend_yield": 2.5},
            ],
        }
        score, _ = calculate_peer_score(data)
        assert 0 <= score <= 25
        assert score > 15  # 優位なので高スコア

    def test_score_in_range(self):
        data = {
            "target_metrics": {"per": 15.0, "roe": 10.0, "pbr": 1.5,
                               "dividend_yield": 2.0},
            "peers": [
                {"per": 15.0, "roe": 10.0, "pbr": 1.5, "dividend_yield": 2.0},
            ],
        }
        score, _ = calculate_peer_score(data)
        assert 0 <= score <= 25
