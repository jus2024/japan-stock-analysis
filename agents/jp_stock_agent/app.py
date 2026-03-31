"""AgentCore Runtime エントリーポイント

BedrockAgentCoreApp を使用して日本株分析エージェントを
AgentCore Runtime 上で実行するためのエントリーポイントです。
"""

import asyncio
import threading

from bedrock_agentcore.runtime import BedrockAgentCoreApp

from common.logging import setup_logger
from jp_stock_agent.agent import create_agent
from jp_stock_agent.tools import get_stock_data_json

logger = setup_logger("jp_stock_agent.app")

app = BedrockAgentCoreApp()

# キューの終端を示すセンチネル
_DONE = object()


@app.entrypoint
async def invoke(payload, context):
    """SSE ストリーミング対応エントリーポイント（POST /invocations）

    callback_handler でテキストチャンクを asyncio.Queue に流し、
    async generator として逐次 yield する。
    エージェント完了後、株価データ JSON をマーカー付きで追加送信する。
    """
    user_message = payload.get(
        "prompt",
        "No prompt found in input, please send a JSON payload with a 'prompt' key.",
    )
    logger.info("SSE ストリーミング呼び出しを受信しました")

    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def streaming_callback(**kwargs):
        """テキストチャンクをキューに送る callback_handler"""
        data = kwargs.get("data", "")
        if data:
            loop.call_soon_threadsafe(queue.put_nowait, data)

    def run_agent():
        """別スレッドでエージェントを実行し、完了時にセンチネルを送る"""
        try:
            agent = create_agent()
            agent(user_message, callback_handler=streaming_callback)
            # ツールが保存した株価データ JSON を callback 経由で送信
            stock_json = get_stock_data_json()
            if stock_json:
                marker = (
                    "\n<!--STOCK_DATA_JSON-->"
                    + stock_json
                    + "<!--/STOCK_DATA_JSON-->\n"
                )
                # callback_handler と同じ経路で queue に送る
                streaming_callback(data=marker)
                logger.info("株価データ JSON をストリームに送信しました")
            loop.call_soon_threadsafe(queue.put_nowait, _DONE)
        except Exception as e:
            loop.call_soon_threadsafe(queue.put_nowait, e)

    thread = threading.Thread(target=run_agent, daemon=True)
    thread.start()

    try:
        while True:
            item = await queue.get()
            if item is _DONE:
                logger.info("ストリーミング完了")
                break
            if isinstance(item, Exception):
                logger.exception("エージェント実行中にエラーが発生しました")
                raise item
            yield item
    finally:
        thread.join(timeout=5)


if __name__ == "__main__":
    app.run()
