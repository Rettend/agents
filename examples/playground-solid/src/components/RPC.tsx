import { createAgent } from "agents/solid";
import { createSignal, For, Show } from "solid-js";
import "./RPC.css";

export default function RPC(props: {
  addToast: (message: string, type: "success" | "error" | "info") => void;
}) {
  const [messages, setMessages] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(false);

  const agent = createAgent({ agent: "rpc" });

  const handleRegularCall = async () => {
    try {
      setLoading(true);
      const result = await agent.call("test");
      props.addToast(`Regular RPC result: ${result}`, "success");
    } catch (error) {
      props.addToast(`Error: ${error}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleStreamingCall = async () => {
    try {
      setLoading(true);
      setMessages([]);
      await agent.call("testStreaming", [], {
        onChunk: (chunk: unknown) => {
          setMessages((prev) => [...prev, chunk as string]);
        }
      });
    } catch (error) {
      props.addToast(`Error: ${error}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDestroy = async () => {
    await agent.call("destroyAgent");
    props.addToast("Agent destroyed", "success");
  };

  return (
    <div class="rpc-container">
      <div class="rpc-content">
        <div class="button-container">
          <button
            type="button"
            onClick={handleDestroy}
            disabled={loading()}
            class="rpc-button button-destroy"
          >
            Destroy Agent
          </button>
          <button
            type="button"
            onClick={handleRegularCall}
            disabled={loading()}
            class="rpc-button button-regular"
          >
            {loading() ? (
              <span class="button-text">
                <svg
                  class="loading-spinner"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  role="img"
                  aria-label="Loading spinner"
                >
                  <title>Loading spinner</title>
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  />
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Processing...
              </span>
            ) : (
              "Regular RPC Call"
            )}
          </button>
          <button
            type="button"
            onClick={handleStreamingCall}
            disabled={loading()}
            class="rpc-button button-streaming"
          >
            {loading() ? (
              <span class="button-text">
                <svg
                  class="loading-spinner"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  role="img"
                  aria-label="Loading spinner"
                >
                  <title>Loading spinner</title>
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  />
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Streaming...
              </span>
            ) : (
              "Start Streaming"
            )}
          </button>
        </div>

        <Show when={messages().length > 0}>
          <div class="messages-container">
            <div class="messages-header">
              <h3>Streaming Messages</h3>
            </div>
            <div class="messages-list">
              <For each={messages()}>
                {(message, index) => (
                  <div class="message-item">
                    <div class="message-content">
                      <div class="message-icon-container">
                        <svg
                          class="message-icon"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          role="img"
                          aria-label="Message icon"
                        >
                          <title>Message icon</title>
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                      </div>
                      <div class="message-text">
                        <p class="message-main">{message}</p>
                        <p class="message-number">Message #{index() + 1}</p>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
