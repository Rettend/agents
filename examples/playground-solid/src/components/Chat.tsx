import "./Chat.css";
import { createAgentChat } from "@cloudflare/ai-chat/solid";
import { createAgent } from "agents/solid";
import { createSignal, createEffect, For, Show } from "solid-js";

const ROOMS = [
  { id: "1", label: "Room 1" },
  { id: "2", label: "Room 2" },
  { id: "3", label: "Room 3" }
];

function ChatRoom(props: { roomId: string }) {
  let messagesEndRef: HTMLDivElement | undefined;

  const agent = createAgent(() => ({
    agent: "chat",
    name: `chat-${props.roomId}`
  }));

  const { messages, setMessages, sendMessage, clearHistory } = createAgentChat({
    agent
  });

  const [input, setInput] = createSignal("");

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!input().trim()) return;

    const message = input();
    setInput("");

    try {
      await sendMessage({
        role: "user",
        parts: [{ type: "text", text: message }]
      });
    } catch (err) {
      console.error("[Chat] Error sending message:", err);
    }
  };

  createEffect(() => {
    if (messages.length > 0) {
      messagesEndRef?.scrollIntoView({ behavior: "smooth" });
    }
  });

  return (
    <>
      <div class="controls-container">
        <button type="button" onClick={clearHistory} class="clear-history">
          🗑️ Clear History
        </button>
      </div>

      <div class="chat-container">
        <div class="messages-wrapper">
          <For each={messages}>
            {(m) => (
              <div class="message">
                <strong>{`${m.role}: `}</strong>
                <Show when={m.parts && m.parts.length > 0}>
                  <For each={m.parts?.filter((p: any) => p.type === "text")}>
                    {(part) => (
                      <div class="message-content">{(part as any).text}</div>
                    )}
                  </For>
                </Show>
              </div>
            )}
          </For>
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit}>
          <input
            class="chat-input"
            value={input()}
            placeholder={`Say something in Room ${props.roomId}...`}
            onInput={(e) => setInput(e.currentTarget.value)}
          />
        </form>
      </div>
    </>
  );
}

export default function Chat() {
  const [activeRoom, setActiveRoom] = createSignal(ROOMS[0].id);

  return (
    <div class="chat-wrapper">
      <div class="tab-bar">
        <For each={ROOMS}>
          {(room) => (
            <button
              type="button"
              class={`tab ${activeRoom() === room.id ? "active" : ""}`}
              onClick={() => setActiveRoom(room.id)}
            >
              {room.label}
            </button>
          )}
        </For>
      </div>
      <Show when={activeRoom()} keyed>
        {(roomId) => <ChatRoom roomId={roomId} />}
      </Show>
    </div>
  );
}
