import { createAgent } from "agents/solid";
import { createSignal, For } from "solid-js";
import type {
  IncomingMessage,
  OutgoingMessage,
  ScheduledItem
} from "../shared";
import "./Schedule.css";

interface SchedulerProps {
  addToast: (message: string, type?: "success" | "error" | "info") => void;
}

export function Scheduler(props: SchedulerProps) {
  const [scheduledItems, setScheduledItems] = createSignal<ScheduledItem[]>([]);
  const [input, setInput] = createSignal("");

  const agent = createAgent({
    agent: "scheduler",
    onMessage: (message) => {
      if (typeof message.data !== "string") return;

      let parsedMessage: OutgoingMessage;
      try {
        parsedMessage = JSON.parse(message.data) as OutgoingMessage;
      } catch {
        return;
      }

      if (parsedMessage.type === "schedules") {
        setScheduledItems(parsedMessage.data);
      } else if (parsedMessage.type === "run-schedule") {
        props.addToast(
          `Running schedule ${parsedMessage.data.description}`,
          "info"
        );
        if (parsedMessage.data.type !== "cron") {
          // remove the schedule from the list
          setScheduledItems((items) =>
            items.filter((item) => item.id !== parsedMessage.data.id)
          );
        }
      } else if (parsedMessage.type === "error") {
        props.addToast(parsedMessage.data, "error");
      } else if (parsedMessage.type === "schedule") {
        setScheduledItems((items) => [...items, parsedMessage.data]);
      }
    }
  });

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!input().trim()) return;

    agent.send(
      JSON.stringify({
        input: input(),
        type: "schedule"
      } satisfies IncomingMessage)
    );
    setInput("");
  };

  const handleDelete = (id: string) => {
    agent.send(
      JSON.stringify({
        id,
        type: "delete-schedule"
      } satisfies IncomingMessage)
    );
    setScheduledItems((items) => items.filter((item) => item.id !== id));
    props.addToast("Task removed", "info");
  };

  return (
    <>
      <form onSubmit={handleSubmit} class="inputForm">
        <input
          type="text"
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          placeholder="Enter your schedule in natural language..."
          class="scheduleInput"
        />
      </form>

      <div class="itemsList">
        <For each={scheduledItems()}>
          {(item) => (
            <div class="scheduledItem">
              <div class="itemContent">
                <div class="itemDetails">
                  <span class="trigger">Trigger: {item.trigger}</span>
                  <span class="nextTrigger">
                    Next: {item.nextTrigger.toLocaleString()}
                  </span>
                  <span class="description">{item.description}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  class="deleteButton"
                  aria-label="Delete item"
                >
                  ⨉
                </button>
              </div>
            </div>
          )}
        </For>
      </div>
    </>
  );
}
