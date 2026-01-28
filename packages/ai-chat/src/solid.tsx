import { createSignal, createEffect, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { UIMessage } from "ai";
import { MessageType, type OutgoingMessage } from "./types";
import { nanoid } from "nanoid";
import type { AgentClient } from "agents/client";

export type CreateAgentChatOptions<State = unknown> = {
  agent: AgentClient<State> & { agent: string; name: string };
};

export interface CreateAgentChatResult {
  messages: UIMessage[];
  setMessages: (
    messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])
  ) => void;
  sendMessage: (message: {
    role: "user";
    parts: Array<{ type: "text"; text: string }>;
  }) => Promise<void>;
  clearHistory: () => void;
  status: "ready" | "streaming" | "error";
  error: Error | undefined;
}

export function createAgentChat<State = unknown>(
  props: CreateAgentChatOptions<State>
): CreateAgentChatResult {
  const { agent } = props;

  const [messages, setMessagesStore] = createStore<UIMessage[]>([]);
  const [status, setStatus] = createSignal<"ready" | "streaming" | "error">(
    "ready"
  );
  const [error, setError] = createSignal<Error | undefined>(undefined);

  const localRequestIds = new Set<string>();

  const remoteStreams = new Map<
    string,
    { messageId: string; textContent: string }
  >();

  const handleServerMessage = (event: MessageEvent) => {
    let data: OutgoingMessage<UIMessage>;
    try {
      data = JSON.parse(event.data) as OutgoingMessage<UIMessage>;
    } catch (_error) {
      return;
    }

    switch (data.type) {
      case MessageType.CF_AGENT_CHAT_CLEAR:
        setMessagesStore(reconcile([], { key: "id" }));
        break;

      case MessageType.CF_AGENT_CHAT_MESSAGES:
        if (data.messages) {
          setMessagesStore(reconcile(data.messages, { key: "id" }));
        }
        break;

      case MessageType.CF_AGENT_USE_CHAT_RESPONSE:
        if (localRequestIds.has(data.id)) {
          return;
        }

        try {
          const chunk = JSON.parse(data.body);

          if (chunk.type === "start" && chunk.messageId) {
            remoteStreams.set(data.id, {
              messageId: chunk.messageId,
              textContent: ""
            });
            const assistantMessage: UIMessage = {
              id: chunk.messageId,
              role: "assistant",
              parts: []
            };
            setMessagesStore((prev) => [...prev, assistantMessage]);
          } else if (chunk.type === "text-delta" && chunk.delta) {
            const stream = remoteStreams.get(data.id);
            if (stream) {
              stream.textContent += chunk.delta;
              const currentMessageId = stream.messageId;
              const currentTextContent = stream.textContent;
              setMessagesStore((prev) => {
                const idx = prev.findIndex((m) => m.id === currentMessageId);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = {
                    ...updated[idx],
                    parts: [{ type: "text", text: currentTextContent }]
                  };
                  return updated;
                }
                return prev;
              });
            }
          } else if (chunk.type === "finish" || data.done) {
            remoteStreams.delete(data.id);
          }
        } catch (e) {
          // ignore
        }
        break;
    }
  };

  const getAgentUrl = (): string => {
    // @ts-expect-error accessing protected properties
    const rawUrl = (agent._url as string | null) ?? agent._pkurl;
    if (!rawUrl) {
      return "/api/chat";
    }
    return rawUrl.replace("ws://", "http://").replace("wss://", "https://");
  };

  createEffect(() => {
    const fetchHistory = async () => {
      try {
        const baseUrl = getAgentUrl();
        const url = new URL(baseUrl);
        url.searchParams.delete("_pk");
        url.pathname = url.pathname.replace(/\/+$/, "") + "/get-messages";

        const res = await fetch(url.toString());
        if (res.ok) {
          const history = await res.json();
          if (Array.isArray(history)) {
            setMessagesStore(reconcile(history, { key: "id" }));
          }
        }
      } catch (e) {
        // ignore fetch errors
      }
    };

    fetchHistory();
  });

  createEffect(() => {
    const addListener = agent.addEventListener;
    if (typeof addListener === "function") {
      agent.addEventListener("message", handleServerMessage);
    }
  });

  onCleanup(() => {
    const removeListener = agent.removeEventListener;
    if (typeof removeListener === "function") {
      agent.removeEventListener("message", handleServerMessage);
    }
  });

  const aiFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const {
      method,
      keepalive,
      headers,
      body,
      redirect,
      integrity,
      signal,
      credentials,
      mode,
      referrer,
      referrerPolicy,
      window: windowProp
    } = init || {};

    const id = nanoid(8);
    const abortController = new AbortController();
    let controller: ReadableStreamDefaultController;
    const currentAgent = agent;

    localRequestIds.add(id);

    signal?.addEventListener("abort", () => {
      currentAgent.send(
        JSON.stringify({
          id,
          type: MessageType.CF_AGENT_CHAT_REQUEST_CANCEL
        })
      );
      abortController.abort();
      try {
        controller.close();
      } catch {}
      localRequestIds.delete(id);
    });

    const onMessage = (event: MessageEvent) => {
      let data: OutgoingMessage<UIMessage>;
      try {
        data = JSON.parse(event.data) as OutgoingMessage<UIMessage>;
      } catch (_error) {
        return;
      }
      if (data.type === MessageType.CF_AGENT_USE_CHAT_RESPONSE) {
        if (data.id === id) {
          if (data.error) {
            controller.error(new Error(data.body));
            abortController.abort();
            localRequestIds.delete(id);
          } else {
            if (data.body?.trim()) {
              controller.enqueue(
                new TextEncoder().encode(`data: ${data.body}\n\n`)
              );
            }
            if (data.done) {
              try {
                controller.close();
              } catch {}
              abortController.abort();
              localRequestIds.delete(id);
            }
          }
        }
      }
    };

    currentAgent.addEventListener("message", onMessage);

    currentAgent.send(
      JSON.stringify({
        id,
        init: {
          body,
          credentials,
          headers,
          integrity,
          keepalive,
          method,
          mode,
          redirect,
          referrer,
          referrerPolicy,
          window: windowProp
        },
        type: MessageType.CF_AGENT_USE_CHAT_REQUEST,
        url: input.toString()
      })
    );

    const stream = new ReadableStream({
      start(c) {
        controller = c;
      },
      cancel(_reason) {
        currentAgent.removeEventListener("message", onMessage);
      }
    });

    const responseStream = stream.pipeThrough(
      new TransformStream({
        flush() {
          currentAgent.removeEventListener("message", onMessage);
        }
      })
    );

    return new Response(responseStream);
  };

  async function* parseSSEStream(response: Response): AsyncGenerator<any> {
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim()) {
              try {
                yield JSON.parse(jsonStr);
              } catch (e) {
                // ignore
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  const sendMessage = async (message: {
    role: "user";
    parts: Array<{ type: "text"; text: string }>;
  }): Promise<void> => {
    const messageId = nanoid();
    const userMessage: UIMessage = {
      id: messageId,
      role: message.role,
      parts: message.parts
    };

    const existingMessages = [...messages];

    setMessagesStore((prev) => [...prev, userMessage]);
    setStatus("streaming");
    setError(undefined);

    try {
      const requestBody = JSON.stringify({
        id: agent.name || "default",
        messages: [...existingMessages, userMessage],
        trigger: "submit-message"
      });

      const response = await aiFetch(getAgentUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody
      });

      let assistantMessageId: string | undefined;
      let textContent = "";

      for await (const chunk of parseSSEStream(response)) {
        if (chunk.type === "start" && chunk.messageId) {
          assistantMessageId = chunk.messageId as string;
          const assistantMessage: UIMessage = {
            id: assistantMessageId,
            role: "assistant",
            parts: []
          };
          setMessagesStore((prev) => [...prev, assistantMessage]);
        } else if (chunk.type === "text-delta" && chunk.delta) {
          textContent += chunk.delta;
          if (assistantMessageId) {
            const currentAssistantId = assistantMessageId;
            setMessagesStore((prev) => {
              const idx = prev.findIndex((m) => m.id === currentAssistantId);
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = {
                  ...updated[idx],
                  parts: [{ type: "text", text: textContent }]
                };
                return updated;
              }
              return prev;
            });
          }
        }
      }

      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setStatus("error");
    }
  };

  const clearHistory = () => {
    setMessagesStore(reconcile([], { key: "id" }));
    agent.send(
      JSON.stringify({
        type: MessageType.CF_AGENT_CHAT_CLEAR
      })
    );
  };

  const setMessages = (
    messagesOrFn: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])
  ) => {
    if (typeof messagesOrFn === "function") {
      setMessagesStore(messagesOrFn);
    } else {
      setMessagesStore(reconcile(messagesOrFn, { key: "id" }));
    }
    agent.send(
      JSON.stringify({
        messages: Array.isArray(messagesOrFn) ? messagesOrFn : [],
        type: MessageType.CF_AGENT_CHAT_MESSAGES
      })
    );
  };

  return {
    get messages() {
      return messages;
    },
    setMessages,
    sendMessage,
    clearHistory,
    get status() {
      return status();
    },
    get error() {
      return error();
    }
  };
}
