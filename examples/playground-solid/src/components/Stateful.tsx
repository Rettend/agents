import { createAgent } from "agents/solid";
import { createSignal, Show } from "solid-js";
import "./State.css";

interface StateProps {
  addToast: (message: string, type?: "success" | "error" | "info") => void;
}

interface State {
  counter: number;
  text: string;
  color: string;
  initialState: boolean;
}

export function Stateful(_props: StateProps) {
  const [syncedState, setSyncedState] = createSignal<State>({
    color: "#3B82F6",
    counter: 0,
    initialState: true,
    text: ""
  });

  const agent = createAgent<State>({
    agent: "stateful",
    onStateUpdate: (state) => {
      setSyncedState(state);
    }
  });

  const handleIncrement = () => {
    const s = syncedState();
    const newCounter = s.counter + 1;
    agent.setState({ ...s, counter: newCounter });
  };

  const handleDecrement = () => {
    const s = syncedState();
    const newCounter = s.counter - 1;
    agent.setState({ ...s, counter: newCounter });
  };

  const handleTextChange = (e: Event) => {
    const newText = (e.currentTarget as HTMLInputElement).value;
    const s = syncedState();
    agent.setState({ ...s, text: newText });
  };

  const handleColorChange = (e: Event) => {
    const newColor = (e.currentTarget as HTMLInputElement).value;
    const s = syncedState();
    const newState = { ...s, color: newColor };
    setSyncedState(newState);
    agent.setState(newState);
  };

  return (
    <div class="state-container">
      <div class="state-grid">
        <Show when={!syncedState().initialState}>
          <>
            <div class="state-section">
              <h3 class="section-title">Counter</h3>
              <div class="counter-controls">
                <button
                  type="button"
                  onClick={handleDecrement}
                  class="counter-button counter-button-decrease"
                >
                  -
                </button>
                <span class="counter-value">{syncedState().counter}</span>
                <button
                  type="button"
                  onClick={handleIncrement}
                  class="counter-button counter-button-increase"
                >
                  +
                </button>
              </div>
            </div>

            <div class="state-section">
              <h3 class="section-title">Text Input</h3>
              <input
                type="text"
                value={syncedState().text}
                onInput={handleTextChange}
                class="state-input"
                placeholder="Type to sync..."
              />
            </div>

            <div class="state-section">
              <h3 class="section-title">Color Picker</h3>
              <div class="color-picker-container">
                <input
                  type="color"
                  value={syncedState().color}
                  onInput={handleColorChange}
                  class="color-picker"
                />
                <div
                  class="color-preview"
                  style={{ "background-color": syncedState().color }}
                />
              </div>
            </div>
          </>
        </Show>
      </div>

      <div class="state-hint">
        Open multiple windows to test state synchronization
      </div>
    </div>
  );
}
