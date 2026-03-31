"""日本株分析エージェント用スコアリングロジック

各分析カテゴリのスコア算出と総合評価を行う。
- ファンダメンタルズ: 0〜30点
- テクニカル: 0〜25点
- IR・ニュース: 0〜20点
- 同業種比較: 0〜25点
- 総合スコア: 0〜100点（各カテゴリの合計）
"""

from __future__ import annotations


def _clamp(value: int, low: int, high: int) -> int:
    """値を指定範囲にクランプする。"""
    return max(low, min(high, value))


# ---------------------------------------------------------------------------
# 1. ファンダメンタルズスコア (0〜30)
# ---------------------------------------------------------------------------

def calculate_fundamentals_score(metrics: dict) -> tuple[int, str]:
    """財務指標データからファンダメンタルズスコアを算出する。

    Args:
        metrics: get_financial_metrics ツールが返す JSON をパースした dict。
                 キー "metrics" 配下に per, pbr, roe, dividend_yield,
                 revenue, operating_income, net_income, equity_ratio を含む。

    Returns:
        (score 0-30, explanation) のタプル
    """
    m = metrics.get("metrics", {})
    if not m:
        return 0, "財務指標データが取得できなかったため、スコアは0点です"

    points = 0
    reasons: list[str] = []

    # PER (0〜8点): 低いほど割安
    per = m.get("per")
    if per is not None:
        if per < 10:
            pts = 8
        elif per < 15:
            pts = 6
        elif per < 20:
            pts = 4
        elif per < 30:
            pts = 2
        else:
            pts = 1
        points += pts
        reasons.append(f"PER {per}倍 → {pts}点")
    else:
        reasons.append("PER データなし → 0点")

    # PBR (0〜6点): 1倍前後が適正
    pbr = m.get("pbr")
    if pbr is not None:
        if pbr < 1.0:
            pts = 6
        elif pbr < 1.5:
            pts = 5
        elif pbr < 2.5:
            pts = 3
        else:
            pts = 1
        points += pts
        reasons.append(f"PBR {pbr}倍 → {pts}点")
    else:
        reasons.append("PBR データなし → 0点")

    # ROE (0〜8点): 高いほど良い
    roe = m.get("roe")
    if roe is not None:
        if roe >= 15:
            pts = 8
        elif roe >= 10:
            pts = 6
        elif roe >= 5:
            pts = 4
        elif roe >= 0:
            pts = 2
        else:
            pts = 0
        points += pts
        reasons.append(f"ROE {roe}% → {pts}点")
    else:
        reasons.append("ROE データなし → 0点")

    # 配当利回り (0〜4点)
    div_yield = m.get("dividend_yield")
    if div_yield is not None:
        if div_yield >= 4.0:
            pts = 4
        elif div_yield >= 3.0:
            pts = 3
        elif div_yield >= 1.5:
            pts = 2
        elif div_yield > 0:
            pts = 1
        else:
            pts = 0
        points += pts
        reasons.append(f"配当利回り {div_yield}% → {pts}点")
    else:
        reasons.append("配当利回り データなし → 0点")

    # 自己資本比率 (0〜4点)
    eq_ratio = m.get("equity_ratio")
    if eq_ratio is not None:
        if eq_ratio >= 60:
            pts = 4
        elif eq_ratio >= 40:
            pts = 3
        elif eq_ratio >= 20:
            pts = 2
        else:
            pts = 1
        points += pts
        reasons.append(f"自己資本比率 {eq_ratio}% → {pts}点")
    else:
        reasons.append("自己資本比率 データなし → 0点")

    score = _clamp(points, 0, 30)
    explanation = f"ファンダメンタルズ: {score}/30点（{', '.join(reasons)}）"
    return score, explanation


# ---------------------------------------------------------------------------
# 2. テクニカルスコア (0〜25)
# ---------------------------------------------------------------------------

def calculate_technical_score(prices_data: dict) -> tuple[int, str]:
    """株価データからテクニカルスコアを算出する。

    Args:
        prices_data: get_stock_prices ツールが返す JSON をパースした dict。
                     キー "prices" 配下に date, close, ma5, ma25, ma75, ma200
                     等を含むデータポイントのリスト。

    Returns:
        (score 0-25, explanation) のタプル
    """
    prices = prices_data.get("prices", [])
    if not prices or len(prices) < 2:
        return 0, "株価データが不足しているため、テクニカルスコアは0点です"

    points = 0
    reasons: list[str] = []

    # 直近データを取得
    latest = prices[-1]
    close = latest.get("close")
    if close is None:
        return 0, "直近の終値データがないため、テクニカルスコアは0点です"

    # --- トレンド判定 (0〜8点) ---
    # 短期（25日）と中期（75日）の移動平均線との位置関係
    ma25 = latest.get("ma25")
    ma75 = latest.get("ma75")
    trend_pts = 4  # 基準点（中立）

    if ma25 is not None and close > ma25:
        trend_pts += 2
        reasons.append("終値が25日移動平均線を上回る")
    elif ma25 is not None and close < ma25:
        trend_pts -= 2
        reasons.append("終値が25日移動平均線を下回る")

    if ma75 is not None and close > ma75:
        trend_pts += 2
        reasons.append("終値が75日移動平均線を上回る")
    elif ma75 is not None and close < ma75:
        trend_pts -= 2
        reasons.append("終値が75日移動平均線を下回る")

    trend_pts = _clamp(trend_pts, 0, 8)
    points += trend_pts

    # --- ゴールデンクロス / デッドクロス判定 (0〜5点) ---
    gc_dc_pts = 2  # 基準点（中立）
    if len(prices) >= 2:
        prev = prices[-2]
        prev_ma5 = prev.get("ma5")
        prev_ma25 = prev.get("ma25")
        cur_ma5 = latest.get("ma5")
        cur_ma25 = latest.get("ma25")

        if (prev_ma5 is not None and prev_ma25 is not None
                and cur_ma5 is not None and cur_ma25 is not None):
            if prev_ma5 <= prev_ma25 and cur_ma5 > cur_ma25:
                gc_dc_pts = 5
                reasons.append("ゴールデンクロス発生")
            elif prev_ma5 >= prev_ma25 and cur_ma5 < cur_ma25:
                gc_dc_pts = 0
                reasons.append("デッドクロス発生")

    gc_dc_pts = _clamp(gc_dc_pts, 0, 5)
    points += gc_dc_pts

    # --- 株価モメンタム (0〜7点) ---
    # 直近20日間の騰落率
    momentum_pts = 3  # 基準点
    lookback = min(20, len(prices))
    past = prices[-lookback]
    past_close = past.get("close")
    if past_close is not None and past_close > 0:
        change_pct = ((close - past_close) / past_close) * 100
        if change_pct > 10:
            momentum_pts = 7
        elif change_pct > 5:
            momentum_pts = 6
        elif change_pct > 0:
            momentum_pts = 4
        elif change_pct > -5:
            momentum_pts = 2
        elif change_pct > -10:
            momentum_pts = 1
        else:
            momentum_pts = 0
        reasons.append(f"直近{lookback}日騰落率 {change_pct:+.1f}%")

    momentum_pts = _clamp(momentum_pts, 0, 7)
    points += momentum_pts

    # --- 長期トレンド (0〜5点) ---
    ma200 = latest.get("ma200")
    long_pts = 2  # 基準点
    if ma200 is not None:
        if close > ma200 * 1.1:
            long_pts = 5
            reasons.append("終値が200日移動平均線を大きく上回る")
        elif close > ma200:
            long_pts = 4
            reasons.append("終値が200日移動平均線を上回る")
        elif close > ma200 * 0.9:
            long_pts = 1
            reasons.append("終値が200日移動平均線をやや下回る")
        else:
            long_pts = 0
            reasons.append("終値が200日移動平均線を大きく下回る")

    long_pts = _clamp(long_pts, 0, 5)
    points += long_pts

    score = _clamp(points, 0, 25)
    explanation = f"テクニカル: {score}/25点（{', '.join(reasons)}）"
    return score, explanation


# ---------------------------------------------------------------------------
# 3. IR・ニューススコア (0〜20)
# ---------------------------------------------------------------------------

def calculate_news_score(news_data: dict) -> tuple[int, str]:
    """ニュースデータからIR・ニューススコアを算出する。

    Args:
        news_data: search_news ツールが返す JSON をパースした dict。
                   キー "news" 配下にニュース記事リスト、
                   "impact_summary" に影響度集計を含む。

    Returns:
        (score 0-20, explanation) のタプル
    """
    news_list = news_data.get("news", [])

    if not news_list:
        return 10, "ニュース情報が取得できなかったため、中立スコア（10/20点）としました"

    # impact_summary がある場合はそれを使用
    impact_summary = news_data.get("impact_summary")
    if impact_summary:
        pos = impact_summary.get("ポジティブ", 0)
        neg = impact_summary.get("ネガティブ", 0)
        neu = impact_summary.get("ニュートラル", 0)
    else:
        # 個別記事から集計
        pos = sum(1 for n in news_list if n.get("impact") == "ポジティブ")
        neg = sum(1 for n in news_list if n.get("impact") == "ネガティブ")
        neu = sum(1 for n in news_list if n.get("impact") == "ニュートラル")

    total = pos + neg + neu
    if total == 0:
        return 10, "ニュースの影響度が判定できなかったため、中立スコア（10/20点）としました"

    # ポジティブ比率に基づくスコア算出
    # 全てポジティブ → 20点、全てネガティブ → 0点、均等 → 10点
    positive_ratio = pos / total
    negative_ratio = neg / total
    raw_score = round(10 + (positive_ratio - negative_ratio) * 10)
    score = _clamp(raw_score, 0, 20)

    reasons = [
        f"ニュース{total}件",
        f"ポジティブ{pos}件",
        f"ネガティブ{neg}件",
        f"ニュートラル{neu}件",
    ]
    explanation = f"IR・ニュース: {score}/20点（{', '.join(reasons)}）"
    return score, explanation


# ---------------------------------------------------------------------------
# 4. 同業種比較スコア (0〜25)
# ---------------------------------------------------------------------------

def calculate_peer_score(peer_data: dict) -> tuple[int, str]:
    """同業種比較データからスコアを算出する。

    Args:
        peer_data: get_sector_peers ツールが返す JSON をパースした dict。
                   キー "target_metrics", "peers" を含む。

    Returns:
        (score 0-25, explanation) のタプル
    """
    target = peer_data.get("target_metrics", {})
    peers = peer_data.get("peers", [])

    if not peers:
        return 12, "同業種比較データが不足しているため、中立スコア（12/25点）としました"

    points = 0
    reasons: list[str] = []

    # PER 比較 (0〜7点): 同業種平均より低い（割安）ほど高得点
    t_per = target.get("per")
    peer_pers = [p["per"] for p in peers if p.get("per") is not None]
    if t_per is not None and peer_pers:
        avg_per = sum(peer_pers) / len(peer_pers)
        if avg_per > 0:
            ratio = t_per / avg_per
            if ratio < 0.7:
                pts = 7
            elif ratio < 0.9:
                pts = 5
            elif ratio < 1.1:
                pts = 3
            elif ratio < 1.3:
                pts = 2
            else:
                pts = 1
        else:
            pts = 3
        points += pts
        reasons.append(f"PER比較 {pts}点")
    else:
        points += 3  # データなしは中立
        reasons.append("PER比較 データなし → 3点")

    # ROE 比較 (0〜7点): 同業種平均より高いほど高得点
    t_roe = target.get("roe")
    peer_roes = [p["roe"] for p in peers if p.get("roe") is not None]
    if t_roe is not None and peer_roes:
        avg_roe = sum(peer_roes) / len(peer_roes)
        if avg_roe > 0:
            ratio = t_roe / avg_roe
            if ratio > 1.3:
                pts = 7
            elif ratio > 1.1:
                pts = 5
            elif ratio > 0.9:
                pts = 3
            elif ratio > 0.7:
                pts = 2
            else:
                pts = 1
        else:
            pts = 3
        points += pts
        reasons.append(f"ROE比較 {pts}点")
    else:
        points += 3
        reasons.append("ROE比較 データなし → 3点")

    # PBR 比較 (0〜5点)
    t_pbr = target.get("pbr")
    peer_pbrs = [p["pbr"] for p in peers if p.get("pbr") is not None]
    if t_pbr is not None and peer_pbrs:
        avg_pbr = sum(peer_pbrs) / len(peer_pbrs)
        if avg_pbr > 0:
            ratio = t_pbr / avg_pbr
            if ratio < 0.7:
                pts = 5
            elif ratio < 0.9:
                pts = 4
            elif ratio < 1.1:
                pts = 3
            elif ratio < 1.3:
                pts = 2
            else:
                pts = 1
        else:
            pts = 2
        points += pts
        reasons.append(f"PBR比較 {pts}点")
    else:
        points += 2
        reasons.append("PBR比較 データなし → 2点")

    # 配当利回り比較 (0〜6点)
    t_div = target.get("dividend_yield")
    peer_divs = [p["dividend_yield"] for p in peers if p.get("dividend_yield") is not None]
    if t_div is not None and peer_divs:
        avg_div = sum(peer_divs) / len(peer_divs)
        if avg_div > 0:
            ratio = t_div / avg_div
            if ratio > 1.3:
                pts = 6
            elif ratio > 1.1:
                pts = 5
            elif ratio > 0.9:
                pts = 3
            elif ratio > 0.7:
                pts = 2
            else:
                pts = 1
        else:
            pts = 3
        points += pts
        reasons.append(f"配当利回り比較 {pts}点")
    else:
        points += 3
        reasons.append("配当利回り比較 データなし → 3点")

    score = _clamp(points, 0, 25)
    explanation = f"同業種比較: {score}/25点（{', '.join(reasons)}）"
    return score, explanation


# ---------------------------------------------------------------------------
# 5. 総合スコアと投資判断ラベル
# ---------------------------------------------------------------------------

def get_judgment_label(score: int) -> str:
    """総合スコアに基づく投資判断ラベルを返す。

    スコアが高いほどポジティブなラベルを返す（単調性を保証）。

    Args:
        score: 総合スコア（0〜100）

    Returns:
        投資判断ラベル: 強気, やや強気, 中立, やや弱気, 弱気
    """
    if score >= 81:
        return "強気"
    if score >= 61:
        return "やや強気"
    if score >= 41:
        return "中立"
    if score >= 21:
        return "やや弱気"
    return "弱気"


def calculate_total_score(
    fundamentals: int,
    technical: int,
    news: int,
    peer: int,
) -> tuple[int, str]:
    """各カテゴリスコアから総合スコアと投資判断ラベルを算出する。

    Args:
        fundamentals: ファンダメンタルズスコア (0〜30)
        technical: テクニカルスコア (0〜25)
        news: IR・ニューススコア (0〜20)
        peer: 同業種比較スコア (0〜25)

    Returns:
        (total 0-100, judgment_label) のタプル
    """
    fundamentals = _clamp(fundamentals, 0, 30)
    technical = _clamp(technical, 0, 25)
    news = _clamp(news, 0, 20)
    peer = _clamp(peer, 0, 25)

    total = fundamentals + technical + news + peer
    total = _clamp(total, 0, 100)

    label = get_judgment_label(total)
    return total, label
