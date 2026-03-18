export const config = {
  runtime: "edge",
};

export type ProxyChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ProxyProviderConfig = {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  temperature?: number;
};

export type ProxyChatRequest = {
  provider?: ProxyProviderConfig;
  messages?: ProxyChatMessage[];
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function extractAssistantReply(payload: any): string {
  return (
    payload?.choices?.[0]?.message?.content ||
    payload?.output?.[0]?.content?.[0]?.text ||
    payload?.reply ||
    ""
  );
}

export async function handleChatProxyRequest(body: ProxyChatRequest, fetcher: typeof fetch = fetch): Promise<Response> {
  const provider = body?.provider;
  const messages = Array.isArray(body?.messages) ? body.messages.filter((message) => message?.content?.trim()) : [];

  if (!provider?.baseUrl || !provider?.model) {
    return json({ error: "Missing provider configuration." }, 400);
  }

  if (!provider.apiKey) {
    return json({ error: "Missing request-time API key." }, 400);
  }

  if (messages.length === 0) {
    return json({ error: "At least one chat message is required." }, 400);
  }

  const upstreamUrl = `${normalizeBaseUrl(provider.baseUrl)}/chat/completions`;
  const upstreamResponse = await fetcher(upstreamUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: Number.isFinite(provider.temperature as number) ? provider.temperature : 0.4,
      messages,
    }),
  });

  const text = await upstreamResponse.text();
  if (!upstreamResponse.ok) {
    return json({ error: text || `Upstream error: ${upstreamResponse.status}` }, upstreamResponse.status);
  }

  const payload = text ? JSON.parse(text) : {};
  return json({ reply: extractAssistantReply(payload), raw: payload });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const body = (await request.json()) as ProxyChatRequest;
  return handleChatProxyRequest(body, fetch);
}
