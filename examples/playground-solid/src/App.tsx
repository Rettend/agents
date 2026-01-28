import "./styles.css";
import { nanoid } from "nanoid";
import { createSignal, onCleanup, For } from "solid-js";
import Chat from "./components/Chat";
import RPC from "./components/RPC";
import { Scheduler } from "./components/Scheduler";
import { Stateful } from "./components/Stateful";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

function Toast(props: {
  message: string;
  type: "success" | "error" | "info";
  onClose: () => void;
}) {
  const timer = setTimeout(() => {
    props.onClose();
  }, 3000);

  onCleanup(() => clearTimeout(timer));

  return <div class={`toast toast-${props.type}`}>{props.message}</div>;
}

function App() {
  const [toasts, setToasts] = createSignal<Toast[]>([]);

  const addToast = (
    message: string,
    type: "success" | "error" | "info" = "success"
  ) => {
    const newToast: Toast = {
      id: nanoid(8),
      message,
      type
    };
    setToasts((prev) => [...prev, newToast]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return (
    <div class="container">
      <div class="toasts-container">
        <For each={toasts()}>
          {(toast) => (
            <Toast
              message={toast.message}
              type={toast.type}
              onClose={() => removeToast(toast.id)}
            />
          )}
        </For>
      </div>

      <div class="grid grid-cols-2 gap-8">
        <div class="col-span-1">
          <h2 class="text-xl font-bold mb-4">Scheduler</h2>
          <Scheduler addToast={addToast} />
        </div>
        <div class="col-span-1">
          <h2 class="text-xl font-bold mb-4">State Sync Demo</h2>
          <Stateful addToast={addToast} />
        </div>
        <div class="col-span-1">
          <h2 class="text-xl font-bold mb-4">Chat</h2>
          <Chat />
        </div>
        <div class="col-span-1">
          <h2 class="text-xl font-bold mb-4">RPC Demo</h2>
          <RPC addToast={addToast} />
        </div>
      </div>
    </div>
  );
}

export default App;
