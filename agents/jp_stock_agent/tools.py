"""日本株分析エージェント用ツール

エージェントが使用するツール関数を定義します。
"""

import json
import math
import os
import re
import urllib.parse
import urllib.request

import yfinance as yf
from strands import tool

from common.logging import setup_logger

logger = setup_logger("jp_stock_agent.tools")


@tool
def search_stock(query: str) -> str:
    """銘柄コードまたは銘柄名から日本の上場企業を特定する。

    Args:
        query: 4桁の銘柄コード（例: "7203"）または銘柄名（例: "トヨタ自動車"）

    Returns:
        企業名と銘柄コードを含む文字列、またはエラーメッセージ
    """
    query = query.strip()
    if not query:
        return "エラー: 検索クエリが空です。銘柄コード（4桁の数字）または銘柄名を入力してください。"

    # 4桁数字の場合は東証銘柄コードとして検索
    if re.fullmatch(r"\d{4}", query):
        return _search_by_code(query)

    # テキスト入力の場合は銘柄名として検索
    return _search_by_name(query)


def _search_by_code(code: str) -> str:
    """銘柄コード（4桁数字）から企業を特定する。"""
    ticker_symbol = f"{code}.T"
    try:
        ticker = yf.Ticker(ticker_symbol)
        info = ticker.info

        company_name = info.get("longName") or info.get("shortName")
        if not company_name:
            logger.warning("銘柄コード %s に対応する企業が見つかりません", code)
            return (
                f"エラー: 銘柄コード「{code}」に一致する上場企業が"
                "見つかりませんでした。正しい4桁の銘柄コードを入力してください。"
            )

        logger.info("銘柄特定成功: %s (%s)", company_name, ticker_symbol)
        return f"企業名: {company_name}\n銘柄コード: {code}\nティッカー: {ticker_symbol}"

    except Exception as e:
        logger.error("銘柄コード %s の検索中にエラーが発生: %s", code, e)
        return (
            f"エラー: 銘柄コード「{code}」の検索中にエラーが発生しました。"
            "しばらく時間をおいて再度お試しください。"
        )


def _search_by_name(name: str) -> str:
    """銘柄名（テキスト）から企業を特定する。"""
    try:
        # yfinance の search 機能で銘柄を検索
        results = yf.Search(name, max_results=5)

        if results.quotes:
            for quote in results.quotes:
                symbol = quote.get("symbol", "")
                # 東証銘柄（.T サフィックス）を優先
                if symbol.endswith(".T"):
                    quote_name = (
                        quote.get("longname")
                        or quote.get("shortname")
                        or ""
                    )
                    code = symbol.replace(".T", "")

                    if quote_name:
                        logger.info("銘柄名検索成功: %s (%s)", quote_name, symbol)
                        return f"企業名: {quote_name}\n銘柄コード: {code}\nティッカー: {symbol}"

        logger.warning("銘柄名「%s」に一致する東証上場企業が見つかりません", name)
        return (
            f"エラー: 「{name}」に一致する日本の上場企業が見つかりませんでした。"
            "銘柄名または4桁の銘柄コードを確認して再入力してください。"
        )

    except Exception as e:
        logger.error("銘柄名「%s」の検索中にエラーが発生: %s", name, e)
        return (
            f"エラー: 「{name}」の検索中にエラーが発生しました。"
            "しばらく時間をおいて再度お試しください。"
        )


@tool
def get_stock_prices(ticker_code: str) -> str:
    """過去1年分の日次株価データと移動平均線を取得する。

    テクニカル分析用の要約テキストと、フロントエンドのチャート描画用の
    JSON データ（マーカー付き）を返す。

    Args:
        ticker_code: 4桁の銘柄コード（例: "7203"）

    Returns:
        テクニカル要約 + マーカー付き株価 JSON 文字列
    """
    ticker_code = ticker_code.strip()
    if not ticker_code:
        return "エラー: 銘柄コードが空です。"

    ticker_symbol = f"{ticker_code}.T"

    try:
        ticker = yf.Ticker(ticker_symbol)
        info = ticker.info
        company_name = (
            info.get("longName") or info.get("shortName") or ticker_code
        )

        hist = ticker.history(period="1y")
        if hist.empty:
            logger.warning("銘柄 %s の株価データなし", ticker_code)
            return f"エラー: 銘柄コード「{ticker_code}」の株価データが取得できませんでした。"

        hist = hist.sort_index()

        sma_periods = [5, 25, 75, 200]
        for period in sma_periods:
            col = f"ma{period}"
            hist[col] = hist["Close"].rolling(window=period).mean()

        start_date = hist.index[0].strftime("%Y-%m-%d")
        end_date = hist.index[-1].strftime("%Y-%m-%d")
        data_count = len(hist)
        logger.info(
            "銘柄 %s 株価取得: %s〜%s（%d件）",
            ticker_symbol, start_date, end_date, data_count,
        )

        # 全データポイントを構築
        prices = []
        for idx, row in hist.iterrows():
            point = {
                "date": idx.strftime("%Y-%m-%d"),
                "open": _round_or_none(row["Open"]),
                "high": _round_or_none(row["High"]),
                "low": _round_or_none(row["Low"]),
                "close": _round_or_none(row["Close"]),
                "volume": (
                    int(row["Volume"])
                    if not _is_nan(row["Volume"]) else 0
                ),
            }
            for period in sma_periods:
                key = f"ma{period}"
                point[key] = _round_or_none(row.get(key))
            prices.append(point)

        # --- チャート用 JSON（マーカー付き）---
        # 日次データを週次に間引く（チャート描画用、約52ポイント）
        # 毎週金曜日 or 最終営業日 + 直近5日は日次で保持
        chart_prices = []
        total = len(prices)
        for i, p in enumerate(prices):
            is_recent = i >= total - 5
            is_weekly = i % 5 == 0
            is_last = i == total - 1
            if is_recent or is_weekly or is_last:
                chart_prices.append(p)

        chart_payload = json.dumps({
            "ticker_code": ticker_code,
            "company_name": company_name,
            "prices": chart_prices,
        }, ensure_ascii=False, separators=(",", ":"))

        marker_block = (
            "\n<!--STOCK_DATA_JSON-->"
            + chart_payload
            + "<!--/STOCK_DATA_JSON-->\n"
        )

        # --- テクニカル要約テキスト ---
        latest = prices[-1] if prices else {}
        first = prices[0] if prices else {}
        close = latest.get("close")
        ma5 = latest.get("ma5")
        ma25 = latest.get("ma25")
        ma75 = latest.get("ma75")
        ma200 = latest.get("ma200")

        lines = [
            f"銘柄: {company_name}（{ticker_code}）",
            f"期間: {start_date} 〜 {end_date}（{data_count}日）",
            f"直近終値: {close}円",
            f"期間始値: {first.get('close')}円",
        ]
        for label, val in [
            ("5日MA", ma5), ("25日MA", ma25),
            ("75日MA", ma75), ("200日MA", ma200),
        ]:
            if val is not None:
                lines.append(f"{label}: {val}円")

        # トレンド
        if close is not None:
            pos = []
            if ma25 is not None:
                pos.append(f"25日MA{'上' if close > ma25 else '下'}")
            if ma75 is not None:
                pos.append(f"75日MA{'上' if close > ma75 else '下'}")
            if ma200 is not None:
                pos.append(f"200日MA{'上' if close > ma200 else '下'}")
            if pos:
                lines.append("終値位置: " + "、".join(pos))

        # GC/DC
        if len(prices) >= 2:
            prev = prices[-2]
            p5, p25 = prev.get("ma5"), prev.get("ma25")
            if all(v is not None for v in [p5, p25, ma5, ma25]):
                if p5 <= p25 and ma5 > ma25:
                    lines.append("シグナル: ゴールデンクロス発生")
                elif p5 >= p25 and ma5 < ma25:
                    lines.append("シグナル: デッドクロス発生")

        # 騰落率
        fc = first.get("close")
        if fc and close:
            chg = close - fc
            pct = (chg / fc) * 100
            lines.append(f"期間騰落率: {chg:+.1f}円（{pct:+.1f}%）")

        if len(prices) >= 20:
            p20c = prices[-20].get("close")
            if p20c and close:
                c20 = close - p20c
                r20 = (c20 / p20c) * 100
                lines.append(f"直近20日: {c20:+.1f}円（{r20:+.1f}%）")

        highs = [p["high"] for p in prices if p.get("high")]
        lows = [p["low"] for p in prices if p.get("low")]
        if highs and lows:
            lines.append(f"期間高値: {max(highs)}円 / 安値: {min(lows)}円")

        summary = "\n".join(lines)

        logger.info("銘柄 %s テクニカル要約生成完了", ticker_code)

        # 要約テキスト + マーカー付き JSON を返す
        # エージェントは要約を分析に使い、マーカー部分はそのまま出力する
        return summary + marker_block

    except Exception as e:
        logger.error("銘柄 %s 株価取得エラー: %s", ticker_code, e)
        return (
            f"エラー: 銘柄コード「{ticker_code}」の株価データ取得中に"
            "エラーが発生しました。しばらく時間をおいて再度お試しください。"
        )


def _round_or_none(value, digits: int = 1):
    """数値を丸める。NaN/None は None を返す。"""
    if value is None or _is_nan(value):
        return None
    return round(float(value), digits)


def _is_nan(value) -> bool:
    """値が NaN かどうかを判定する。"""
    try:
        return math.isnan(float(value))
    except (TypeError, ValueError):
        return False


def _safe_get(info: dict, key: str, multiplier: float = 1.0):
    """info辞書から値を安全に取得する。NaN や None は None を返す。"""
    val = info.get(key)
    if val is None:
        return None
    try:
        fval = float(val)
        if math.isnan(fval) or math.isinf(fval):
            return None
        result = round(fval * multiplier, 2)
        # yfinance の比率値が異常に大きい場合は multiplier 適用済みと判断
        if multiplier > 1.0 and result > 100.0:
            return round(fval, 2)
        return result
    except (TypeError, ValueError):
        return None


def _evaluate_metric(name: str, value, thresholds: dict) -> str:
    """指標値を業種平均的な閾値と比較して評価コメントを返す。"""
    if value is None:
        return f"{name}のデータが取得できないため評価できません"

    low = thresholds.get("low")
    high = thresholds.get("high")
    low_label = thresholds.get("low_label", "低水準")
    mid_label = thresholds.get("mid_label", "標準的な水準")
    high_label = thresholds.get("high_label", "高水準")

    if low is not None and value < low:
        return f"{name}は{value}で、日本市場平均と比較して{low_label}です"
    if high is not None and value > high:
        return f"{name}は{value}で、日本市場平均と比較して{high_label}です"
    return f"{name}は{value}で、日本市場平均と比較して{mid_label}です"


def _calculate_equity_ratio(ticker) -> float | None:
    """バランスシートから自己資本比率を算出する。"""
    try:
        bs = ticker.balance_sheet
        if bs is None or bs.empty:
            return None

        latest = bs.iloc[:, 0]

        total_equity = None
        for key in ["Stockholders Equity", "Total Stockholder Equity",
                     "Stockholders' Equity", "Common Stock Equity"]:
            if key in latest.index:
                val = latest[key]
                if val is not None and not _is_nan(val):
                    total_equity = float(val)
                    break

        total_assets = None
        for key in ["Total Assets"]:
            if key in latest.index:
                val = latest[key]
                if val is not None and not _is_nan(val):
                    total_assets = float(val)
                    break

        if total_equity is not None and total_assets is not None and total_assets > 0:
            return round((total_equity / total_assets) * 100, 2)
        return None
    except Exception:
        return None


@tool
def get_financial_metrics(ticker_code: str) -> str:
    """PER、PBR、ROE、配当利回り等の財務指標を取得し、業種平均との比較評価を含むJSON形式で返す。

    Args:
        ticker_code: 4桁の銘柄コード（例: "7203"）

    Returns:
        財務指標と評価コメントを含む JSON 文字列、またはエラーメッセージ
    """
    ticker_code = ticker_code.strip()
    if not ticker_code:
        return "エラー: 銘柄コードが空です。4桁の銘柄コードを入力してください。"

    ticker_symbol = f"{ticker_code}.T"

    try:
        ticker = yf.Ticker(ticker_symbol)
        info = ticker.info

        company_name = info.get("longName") or info.get("shortName")
        if not company_name:
            logger.warning("銘柄コード %s に対応する企業が見つかりません", ticker_code)
            return f"エラー: 銘柄コード「{ticker_code}」に一致する上場企業が見つかりませんでした。"

        # 財務指標を取得
        per = _safe_get(info, "trailingPE") or _safe_get(info, "forwardPE")
        pbr = _safe_get(info, "priceToBook")
        roe = _safe_get(info, "returnOnEquity", multiplier=100.0)
        dividend_yield = _safe_get(info, "dividendYield", multiplier=100.0)
        market_cap = _safe_get(info, "marketCap")
        revenue = _safe_get(info, "totalRevenue")
        operating_income = _safe_get(info, "operatingIncome")
        net_income = _safe_get(info, "netIncomeToCommon")
        equity_ratio = _calculate_equity_ratio(ticker)

        # 業種平均との比較評価コメントを生成
        evaluations = []
        evaluations.append(_evaluate_metric("PER", per, {
            "low": 10, "high": 20,
            "low_label": "割安な水準", "mid_label": "標準的な水準",
            "high_label": "割高な水準",
        }))
        evaluations.append(_evaluate_metric("PBR", pbr, {
            "low": 1.0, "high": 2.5,
            "low_label": "割安な水準（1倍割れの可能性）", "mid_label": "標準的な水準",
            "high_label": "割高な水準",
        }))
        evaluations.append(_evaluate_metric("ROE", roe, {
            "low": 5, "high": 10,
            "low_label": "低い水準（資本効率に課題）", "mid_label": "標準的な水準",
            "high_label": "高い水準（資本効率が良好）",
        }))
        evaluations.append(_evaluate_metric("配当利回り", dividend_yield, {
            "low": 1.5, "high": 3.5,
            "low_label": "低い水準", "mid_label": "標準的な水準",
            "high_label": "高い水準（高配当）",
        }))
        evaluations.append(_evaluate_metric("自己資本比率", equity_ratio, {
            "low": 30, "high": 60,
            "low_label": "低い水準（財務安定性に注意）", "mid_label": "標準的な水準",
            "high_label": "高い水準（財務基盤が安定）",
        }))

        # 取得できなかった項目を集計
        metrics_map = {
            "PER": per, "PBR": pbr, "ROE": roe,
            "配当利回り": dividend_yield, "時価総額": market_cap,
            "売上高": revenue, "営業利益": operating_income,
            "純利益": net_income, "自己資本比率": equity_ratio,
        }
        unavailable = [k for k, v in metrics_map.items() if v is None]

        payload = {
            "ticker_code": ticker_code,
            "company_name": company_name,
            "metrics": {
                "per": per,
                "pbr": pbr,
                "roe": roe,
                "dividend_yield": dividend_yield,
                "market_cap": market_cap,
                "revenue": revenue,
                "operating_income": operating_income,
                "net_income": net_income,
                "equity_ratio": equity_ratio,
            },
            "evaluations": evaluations,
            "unavailable_metrics": unavailable if unavailable else None,
        }

        result = json.dumps(payload, ensure_ascii=False)
        logger.info(
            "銘柄 %s の財務指標取得完了（取得不可項目: %s）",
            ticker_code,
            unavailable if unavailable else "なし",
        )
        return result

    except Exception as e:
        logger.error("銘柄コード %s の財務指標取得中にエラーが発生: %s", ticker_code, e)
        return (
            f"エラー: 銘柄コード「{ticker_code}」の財務指標取得中に"
            "エラーが発生しました。しばらく時間をおいて再度お試しください。"
        )


# --- ニュース影響度判定用キーワード ---

_POSITIVE_KEYWORDS = [
    "増収", "増益", "最高益", "上方修正", "好決算", "増配", "自社株買い",
    "株式分割", "業績好調", "受注増", "提携", "新製品", "成長", "回復",
    "黒字", "上昇", "急騰", "高値", "買い", "格上げ",
    "profit", "growth", "upgrade", "positive", "beat", "raise",
    "record", "surge", "rally", "bullish", "dividend",
]

_NEGATIVE_KEYWORDS = [
    "減収", "減益", "赤字", "下方修正", "業績悪化", "減配", "無配",
    "リコール", "不正", "訴訟", "撤退", "損失", "低迷", "下落",
    "急落", "安値", "売り", "格下げ", "倒産", "債務超過",
    "loss", "decline", "downgrade", "negative", "miss", "cut",
    "warning", "bearish", "recall", "lawsuit",
]


def _assess_impact(title: str, description: str = "") -> str:
    """タイトルと説明文からニュースの株価影響度を簡易判定する。"""
    text = (title + " " + description).lower()
    pos = sum(1 for kw in _POSITIVE_KEYWORDS if kw.lower() in text)
    neg = sum(1 for kw in _NEGATIVE_KEYWORDS if kw.lower() in text)
    if pos > neg:
        return "ポジティブ"
    if neg > pos:
        return "ネガティブ"
    return "ニュートラル"


def _fetch_yfinance_news(ticker_code: str) -> list[dict]:
    """yfinance の Ticker.news から直近ニュースを取得する。"""
    items: list[dict] = []
    try:
        ticker = yf.Ticker(f"{ticker_code}.T")
        news_list = ticker.news or []
        for article in news_list[:10]:
            title = article.get("title", "")
            description = article.get("description", "") or article.get("summary", "")
            source = article.get("publisher", "不明")
            published = article.get("providerPublishTime")
            link = article.get("link", "")

            # providerPublishTime は UNIX タイムスタンプの場合がある
            pub_str = ""
            if published:
                try:
                    from datetime import datetime, timezone
                    if isinstance(published, (int, float)):
                        dt = datetime.fromtimestamp(
                            published, tz=timezone.utc,
                        )
                        pub_str = dt.strftime("%Y-%m-%d %H:%M")
                    else:
                        pub_str = str(published)
                except Exception:
                    pub_str = str(published)

            impact = _assess_impact(title, description)
            items.append({
                "title": title,
                "description": description,
                "source": source,
                "published": pub_str,
                "link": link,
                "impact": impact,
                "origin": "yfinance",
            })
    except Exception as e:
        logger.warning("yfinance ニュース取得でエラー: %s", e)
    return items


def _fetch_tavily_news(company_name: str, ticker_code: str) -> list[dict]:
    """Tavily API で企業関連ニュースを拡張検索する。TAVILY_API_KEY が未設定なら空リストを返す。"""
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return []

    items: list[dict] = []
    try:
        query = f"{company_name} {ticker_code} 株価 ニュース"
        payload = json.dumps({
            "api_key": api_key,
            "query": query,
            "search_depth": "basic",
            "max_results": 5,
            "include_answer": False,
        }).encode("utf-8")

        req = urllib.request.Request(
            "https://api.tavily.com/search",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        for result in data.get("results", []):
            title = result.get("title", "")
            description = result.get("content", "")
            source = result.get("url", "")
            published = result.get("published_date", "")

            impact = _assess_impact(title, description)
            items.append({
                "title": title,
                "description": description[:300] if description else "",
                "source": source,
                "published": published,
                "link": source,
                "impact": impact,
                "origin": "tavily",
            })
        logger.info("Tavily API から %d 件のニュースを取得", len(items))
    except Exception as e:
        logger.warning("Tavily API ニュース取得でエラー: %s", e)
    return items


@tool
def search_news(company_name: str, ticker_code: str) -> str:
    """対象企業の直近IR・ニュース情報を取得し、株価への影響度を評価する。

    yfinance の Ticker.news をベースに直近ニュースを取得する。
    TAVILY_API_KEY 環境変数が設定されている場合は Tavily API による拡張検索も実行する。

    Args:
        company_name: 企業名（例: "トヨタ自動車"）
        ticker_code: 4桁の銘柄コード（例: "7203"）

    Returns:
        ニュース情報と影響度評価を含む JSON 文字列、またはエラーメッセージ
    """
    ticker_code = ticker_code.strip()
    company_name = company_name.strip()

    if not ticker_code:
        return "エラー: 銘柄コードが空です。4桁の銘柄コードを入力してください。"
    if not company_name:
        return "エラー: 企業名が空です。"

    try:
        # yfinance からニュースを取得
        yf_news = _fetch_yfinance_news(ticker_code)
        logger.info("yfinance から %d 件のニュースを取得（銘柄: %s）", len(yf_news), ticker_code)

        # Tavily API による拡張検索（API キーが設定されている場合のみ）
        tavily_news = _fetch_tavily_news(company_name, ticker_code)

        all_news = yf_news + tavily_news

        if not all_news:
            logger.info("銘柄 %s (%s) のニュースが見つかりませんでした", ticker_code, company_name)
            payload = {
                "ticker_code": ticker_code,
                "company_name": company_name,
                "news": [],
                "summary": (
                    f"{company_name}（{ticker_code}）に関する"
                    "直近のニュース・IR情報は取得できませんでした。"
                ),
                "tavily_enabled": bool(os.getenv("TAVILY_API_KEY")),
            }
            return json.dumps(payload, ensure_ascii=False)

        # 影響度の集計
        impact_counts = {"ポジティブ": 0, "ネガティブ": 0, "ニュートラル": 0}
        for item in all_news:
            impact_counts[item.get("impact", "ニュートラル")] += 1

        summary_parts = [
            f"{company_name}（{ticker_code}）に関する直近ニュースを{len(all_news)}件取得しました。",
            f"影響度内訳: ポジティブ {impact_counts['ポジティブ']}件、"
            f"ネガティブ {impact_counts['ネガティブ']}件、"
            f"ニュートラル {impact_counts['ニュートラル']}件。",
        ]

        payload = {
            "ticker_code": ticker_code,
            "company_name": company_name,
            "news": all_news,
            "impact_summary": impact_counts,
            "summary": "".join(summary_parts),
            "tavily_enabled": bool(os.getenv("TAVILY_API_KEY")),
        }

        result = json.dumps(payload, ensure_ascii=False)
        logger.info(
            "銘柄 %s のニュース取得完了（yfinance: %d件, tavily: %d件）",
            ticker_code, len(yf_news), len(tavily_news),
        )
        return result

    except Exception as e:
        logger.error(
            "銘柄 %s (%s) のニュース取得中にエラーが発生: %s",
            ticker_code, company_name, e,
        )
        return (
            f"エラー: {company_name}（{ticker_code}）の"
            "ニュース取得中にエラーが発生しました。"
            "しばらく時間をおいて再度お試しください。"
        )


# --- 同業種比較用: 主要日本企業のセクター別マッピング ---

_SECTOR_PEERS: dict[str, list[str]] = {
    "Consumer Cyclical": ["7203", "7267", "7261", "7269", "7201", "7211", "9983", "9984"],
    "Technology": ["6758", "6861", "6902", "6501", "6503", "6752", "6702", "6701", "4063"],
    "Financial Services": ["8306", "8316", "8411", "8604", "8601", "8766", "8750", "8309"],
    "Industrials": ["6301", "6302", "7011", "7012", "6367", "6361", "6326", "7013"],
    "Communication Services": ["9432", "9433", "9434", "4689", "9613", "4755", "3659"],
    "Healthcare": ["4502", "4503", "4519", "4568", "4523", "4506", "4507", "4578"],
    "Basic Materials": ["5401", "5411", "5406", "3401", "3402", "4183", "4188", "4005"],
    "Consumer Defensive": ["2914", "2502", "2503", "2801", "2802", "2269", "2871", "7453"],
    "Energy": ["5020", "5019", "5021", "1605", "1662", "5017"],
    "Real Estate": ["8801", "8802", "8830", "3289", "8804", "3231"],
    "Utilities": ["9501", "9502", "9503", "9531", "9532"],
}


@tool
def get_sector_peers(ticker_code: str) -> str:
    """同業種の主要上場企業を特定し、財務指標を比較する。

    対象銘柄と同一セクターに属する主要企業の PER、PBR、ROE、配当利回り、
    時価総額を取得し、業界内での相対的な位置づけを評価する。

    Args:
        ticker_code: 4桁の銘柄コード（例: "7203"）

    Returns:
        同業種比較データと評価コメントを含む JSON 文字列、またはエラーメッセージ
    """
    ticker_code = ticker_code.strip()
    if not ticker_code:
        return "エラー: 銘柄コードが空です。4桁の銘柄コードを入力してください。"

    ticker_symbol = f"{ticker_code}.T"

    try:
        ticker = yf.Ticker(ticker_symbol)
        info = ticker.info

        company_name = info.get("longName") or info.get("shortName")
        if not company_name:
            return f"エラー: 銘柄コード「{ticker_code}」に一致する上場企業が見つかりませんでした。"

        sector = info.get("sector", "")
        industry = info.get("industry", "")

        # セクターに基づいて同業種銘柄を取得
        peer_codes = _find_peer_codes(ticker_code, sector)

        if len(peer_codes) < 3:
            logger.warning(
                "銘柄 %s のセクター「%s」で十分な同業種企業が見つかりません",
                ticker_code, sector,
            )
            return json.dumps({
                "ticker_code": ticker_code,
                "company_name": company_name,
                "sector": sector,
                "industry": industry,
                "peers": [],
                "evaluation": (
                    f"セクター「{sector}」の同業種企業データが"
                    "不足しているため、比較分析を実行できませんでした。"
                ),
            }, ensure_ascii=False)

        # 対象銘柄の指標を取得
        target_metrics = _fetch_peer_metrics(ticker_code, info=info)

        # 同業種各社の指標を取得
        peers_data = []
        for code in peer_codes:
            m = _fetch_peer_metrics(code)
            if m.get("company_name"):
                peers_data.append(m)

        # 評価コメントを生成
        evaluation = _generate_peer_evaluation(target_metrics, peers_data)

        payload = {
            "ticker_code": ticker_code,
            "company_name": company_name,
            "sector": sector,
            "industry": industry,
            "target_metrics": target_metrics,
            "peers": peers_data,
            "evaluation": evaluation,
        }

        result = json.dumps(payload, ensure_ascii=False)
        logger.info("銘柄 %s の同業種比較完了（%d社）", ticker_code, len(peers_data))
        return result

    except Exception as e:
        logger.error("銘柄 %s の同業種比較中にエラーが発生: %s", ticker_code, e)
        return (
            f"エラー: 銘柄コード「{ticker_code}」の同業種比較中に"
            "エラーが発生しました。しばらく時間をおいて再度お試しください。"
        )


def _find_peer_codes(ticker_code: str, sector: str) -> list[str]:
    """セクターに基づいて同業種の銘柄コードリストを返す（対象銘柄を除く）。"""
    codes = _SECTOR_PEERS.get(sector, [])
    return [c for c in codes if c != ticker_code][:6]


def _fetch_peer_metrics(code: str, info: dict | None = None) -> dict:
    """指定銘柄の比較用財務指標を取得する。"""
    try:
        if info is None:
            ticker = yf.Ticker(f"{code}.T")
            info = ticker.info

        return {
            "ticker_code": code,
            "company_name": info.get("longName") or info.get("shortName") or code,
            "per": _safe_get(info, "trailingPE") or _safe_get(info, "forwardPE"),
            "pbr": _safe_get(info, "priceToBook"),
            "roe": _safe_get(info, "returnOnEquity", multiplier=100.0),
            "dividend_yield": _safe_get(info, "dividendYield", multiplier=100.0),
            "market_cap": _safe_get(info, "marketCap"),
        }
    except Exception as e:
        logger.warning("銘柄 %s の指標取得でエラー: %s", code, e)
        return {"ticker_code": code, "company_name": None, "per": None, "pbr": None,
                "roe": None, "dividend_yield": None, "market_cap": None}


def _generate_peer_evaluation(target: dict, peers: list[dict]) -> str:
    """対象銘柄と同業種他社を比較し、評価コメントを生成する。"""
    if not peers:
        return "同業種他社のデータが不足しているため、比較評価を生成できませんでした。"

    comments = []

    # PER 比較（割安・割高）
    t_per = target.get("per")
    peer_pers = [p["per"] for p in peers if p.get("per") is not None]
    if t_per is not None and peer_pers:
        avg_per = sum(peer_pers) / len(peer_pers)
        if t_per < avg_per * 0.8:
            comments.append(f"PER（{t_per}倍）は同業種平均（{avg_per:.1f}倍）を大きく下回り、割安な水準です")
        elif t_per > avg_per * 1.2:
            comments.append(f"PER（{t_per}倍）は同業種平均（{avg_per:.1f}倍）を上回り、割高な水準です")
        else:
            comments.append(f"PER（{t_per}倍）は同業種平均（{avg_per:.1f}倍）と同程度の水準です")

    # PBR 比較
    t_pbr = target.get("pbr")
    peer_pbrs = [p["pbr"] for p in peers if p.get("pbr") is not None]
    if t_pbr is not None and peer_pbrs:
        avg_pbr = sum(peer_pbrs) / len(peer_pbrs)
        if t_pbr < avg_pbr * 0.8:
            comments.append(f"PBR（{t_pbr}倍）は同業種平均（{avg_pbr:.1f}倍）を下回り、資産面で割安です")
        elif t_pbr > avg_pbr * 1.2:
            comments.append(f"PBR（{t_pbr}倍）は同業種平均（{avg_pbr:.1f}倍）を上回り、市場の期待が高い水準です")
        else:
            comments.append(f"PBR（{t_pbr}倍）は同業種平均（{avg_pbr:.1f}倍）と同程度です")

    # ROE 比較（収益性）
    t_roe = target.get("roe")
    peer_roes = [p["roe"] for p in peers if p.get("roe") is not None]
    if t_roe is not None and peer_roes:
        avg_roe = sum(peer_roes) / len(peer_roes)
        if t_roe > avg_roe * 1.2:
            comments.append(f"ROE（{t_roe}%）は同業種平均（{avg_roe:.1f}%）を上回り、資本効率が優れています")
        elif t_roe < avg_roe * 0.8:
            comments.append(f"ROE（{t_roe}%）は同業種平均（{avg_roe:.1f}%）を下回り、収益性に改善余地があります")
        else:
            comments.append(f"ROE（{t_roe}%）は同業種平均（{avg_roe:.1f}%）と同程度の収益性です")

    # 配当利回り比較
    t_div = target.get("dividend_yield")
    peer_divs = [p["dividend_yield"] for p in peers if p.get("dividend_yield") is not None]
    if t_div is not None and peer_divs:
        avg_div = sum(peer_divs) / len(peer_divs)
        if t_div > avg_div * 1.2:
            comments.append(f"配当利回り（{t_div}%）は同業種平均（{avg_div:.1f}%）を上回る高配当水準です")
        elif t_div < avg_div * 0.8:
            comments.append(f"配当利回り（{t_div}%）は同業種平均（{avg_div:.1f}%）を下回ります")
        else:
            comments.append(f"配当利回り（{t_div}%）は同業種平均（{avg_div:.1f}%）と同程度です")

    # 時価総額比較
    t_cap = target.get("market_cap")
    peer_caps = [p["market_cap"] for p in peers if p.get("market_cap") is not None]
    if t_cap is not None and peer_caps:
        avg_cap = sum(peer_caps) / len(peer_caps)
        if t_cap > avg_cap * 1.5:
            comments.append("時価総額は同業種内で大型に分類され、業界をリードする規模です")
        elif t_cap < avg_cap * 0.5:
            comments.append("時価総額は同業種内で比較的小型であり、成長ポテンシャルがあります")
        else:
            comments.append("時価総額は同業種内で中程度の規模です")

    if not comments:
        return "比較に必要な指標データが不足しているため、詳細な評価を生成できませんでした。"

    return "。".join(comments) + "。"
