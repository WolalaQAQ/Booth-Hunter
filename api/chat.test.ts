import test from "node:test";
import assert from "node:assert/strict";

import { handleChatProxyRequest } from "./chat";

test("chat proxy rejects requests without provider config", async () => {
  const response = await handleChatProxyRequest({
    messages: [{ role: "user", content: "hello" }],
  } as any);

  assert.equal(response.status, 400);
  assert.match(await response.text(), /provider/i);
});

test("chat proxy forwards request-time api key to provider", async () => {
  let seenAuth = "";
  const response = await handleChatProxyRequest(
    {
      provider: {
        baseUrl: "https://llm.example/v1",
        model: "demo-model",
        apiKey: "user-secret",
      },
      messages: [{ role: "user", content: "hello" }],
    },
    async (input, init) => {
      seenAuth = String((init?.headers as Record<string, string>).Authorization);
      assert.equal(String(input), "https://llm.example/v1/chat/completions");
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "hi there" } }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }
  );

  assert.equal(seenAuth, "Bearer user-secret");
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.reply, "hi there");
});
