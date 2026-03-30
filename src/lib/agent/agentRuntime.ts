/**
 * AgentCore Runtime HTTP POST + SSE 通信ユーティリティ
 *
 * Runtime ARN から Invocation URL を構築し、HTTP POST + SSE でエージェントと通信する。
 */

/**
 * Runtime ARN から invocation URL を構築する。
 *
 * URL 形式: https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{encoded-arn}/invocations?qualifier=DEFAULT
 */
export function buildInvocationUrl(runtimeArn: string): string {
  const parts = runtimeArn.split(":");
  const region = parts[3];
  if (!region || parts.length < 6) {
    throw new Error(`Invalid Runtime ARN format: ${runtimeArn}`);
  }
  const encodedArn = encodeURIComponent(runtimeArn);
  return `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodedArn}/invocations?qualifier=DEFAULT`;
}

/**
 * SSE ストリームを行単位でパースし、コールバックでイベントを配信する。
 *
 * - `data:` 行の JSON から `chunk` フィールドを `onChunk` に渡す
 * - `[DONE]` マーカーで `onComplete` を呼んで終了
 * - コメント行（`:` 始まり）と空行をスキップ
 * - `error` フィールドがあれば `onError` に渡して終了
 * - JSON パース失敗時はテキストをそのまま `onChunk` に渡す
 * - ストリーム正常終了時（`[DONE]` なし）も `onComplete` を呼ぶ
 */
async function readSSEStream(
  response: Response,
  onChunk: (text: string) => void,
  onError: (error: string) => void,
  onComplete: () => void,
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        if (trimmed.startsWith("data: ")) {
          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            onComplete();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.chunk) {
              onChunk(parsed.chunk);
            } else if (parsed.error) {
              onError(parsed.error);
              return;
            } else if (typeof parsed === "string") {
              onChunk(parsed);
            }
          } catch {
            onChunk(data);
          }
        }
      }
    }
    onComplete();
  } catch (err) {
    onError(err instanceof Error ? err.message : "SSE stream read error");
  }
}

/**
 * AgentCore Runtime に HTTP POST でメッセージを送信し、SSE ストリームを読み取る。
 *
 * fetch API を使用し、レスポンスの ReadableStream を行単位でパースする。
 * 各 SSE イベントの data フィールドを onChunk コールバックで返す。
 */
export async function invokeRuntime(params: {
  runtimeArn: string;
  accessToken: string;
  sessionId: string;
  prompt: string;
  onChunk: (text: string) => void;
  onError: (error: string) => void;
  onComplete: () => void;
  signal?: AbortSignal;
}): Promise<void> {
  const url = buildInvocationUrl(params.runtimeArn);

  let errorCalled = false;

  const safeOnError = (msg: string) => {
    if (!errorCalled) {
      errorCalled = true;
      params.onError(msg);
    }
  };

  const safeOnComplete = () => {
    if (!errorCalled) {
      params.onComplete();
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
        "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": params.sessionId,
      },
      body: JSON.stringify({ prompt: params.prompt }),
      signal: params.signal,
    });

    if (!response.ok) {
      safeOnError(`HTTP ${response.status}: ${response.statusText}`);
      return;
    }

    await readSSEStream(response, params.onChunk, safeOnError, safeOnComplete);
  } catch (err) {
    safeOnError(err instanceof Error ? err.message : "Request failed");
  }
}