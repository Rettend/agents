import {
  createSignal,
  createEffect,
  onCleanup,
  createResource,
  untrack,
  type Accessor
} from "solid-js";
import {
  AgentClient,
  type AgentClientOptions,
  type StreamOptions
} from "./client";
import type { Agent, MCPServersState } from "./";
import type { Method, RPCMethod } from "./serializable";
import { MessageType } from "./types";

/**
 * Creates a proxy that wraps RPC method calls.
 * Internal JS methods (toJSON, then, etc.) return undefined to avoid
 * triggering RPC calls during serialization (e.g., console.log)
 */
function createStubProxy<T = Record<string, Method>>(
  call: (method: string, args: unknown[]) => unknown
): T {
  // biome-ignore lint/suspicious/noExplicitAny: proxy needs any for dynamic method access
  return new Proxy<any>(
    {},
    {
      get: (_target, method) => {
        // Skip internal JavaScript methods that shouldn't trigger RPC calls.
        if (
          typeof method === "symbol" ||
          method === "toJSON" ||
          method === "then" ||
          method === "catch" ||
          method === "finally" ||
          method === "valueOf" ||
          method === "toString" ||
          method === "constructor" ||
          method === "prototype" ||
          method === "$$typeof" ||
          method === "@@toStringTag" ||
          method === "asymmetricMatch" ||
          method === "nodeType"
        ) {
          return undefined;
        }
        return (...args: unknown[]) => call(method as string, args);
      }
    }
  );
}

type AllOptional<T> = T extends [infer A, ...infer R]
  ? undefined extends A
    ? AllOptional<R>
    : false
  : true; // no params means optional by default

type RPCMethods<T> = {
  [K in keyof T as T[K] extends RPCMethod<T[K]> ? K : never]: RPCMethod<T[K]>;
};

type OptionalParametersMethod<T extends RPCMethod> =
  AllOptional<Parameters<T>> extends true ? T : never;

// all methods of the Agent, excluding the ones that are declared in the base Agent class
// biome-ignore lint: suppressions/parse
type AgentMethods<T> = Omit<RPCMethods<T>, keyof Agent<any, any>>;

type OptionalAgentMethods<T> = {
  [K in keyof AgentMethods<T> as AgentMethods<T>[K] extends OptionalParametersMethod<
    AgentMethods<T>[K]
  >
    ? K
    : never]: OptionalParametersMethod<AgentMethods<T>[K]>;
};

type RequiredAgentMethods<T> = Omit<
  AgentMethods<T>,
  keyof OptionalAgentMethods<T>
>;

type AgentPromiseReturnType<T, K extends keyof AgentMethods<T>> =
  // biome-ignore lint: suppressions/parse
  ReturnType<AgentMethods<T>[K]> extends Promise<any>
    ? ReturnType<AgentMethods<T>[K]>
    : Promise<ReturnType<AgentMethods<T>[K]>>;

type OptionalArgsAgentMethodCall<AgentT> = <
  K extends keyof OptionalAgentMethods<AgentT>
>(
  method: K,
  args?: Parameters<OptionalAgentMethods<AgentT>[K]>,
  streamOptions?: StreamOptions
) => AgentPromiseReturnType<AgentT, K>;

type RequiredArgsAgentMethodCall<AgentT> = <
  K extends keyof RequiredAgentMethods<AgentT>
>(
  method: K,
  args: Parameters<RequiredAgentMethods<AgentT>[K]>,
  streamOptions?: StreamOptions
) => AgentPromiseReturnType<AgentT, K>;

type AgentMethodCall<AgentT> = OptionalArgsAgentMethodCall<AgentT> &
  RequiredArgsAgentMethodCall<AgentT>;

type UntypedAgentMethodCall = <T = unknown>(
  method: string,
  args?: unknown[],
  streamOptions?: StreamOptions
) => Promise<T>;

type AgentStub<T> = {
  [K in keyof AgentMethods<T>]: (
    ...args: Parameters<AgentMethods<T>[K]>
  ) => AgentPromiseReturnType<AgentMethods<T>, K>;
};

// we neet to use Method instead of RPCMethod here for retro-compatibility
type UntypedAgentStub = Record<string, Method>;

/**
 * Options for the createAgent primitive
 * @template State Type of the Agent's state
 */
export type CreateAgentOptions<State = unknown> = Omit<
  AgentClientOptions<State>,
  "query" | "party" | "room" | "host"
> & {
  /** Query parameters - can be static object or async function */
  query?:
    | Record<string, string | null>
    | (() => Promise<Record<string, string | null>>);
  /** Dependencies for async query caching (not used in Solid, use Signals instead) */
  queryDeps?: unknown[];
  /** Cache TTL in milliseconds for auth tokens/time-sensitive data */
  cacheTtl?: number;
  /** Called when MCP server state is updated */
  onMcpUpdate?: (mcpServers: MCPServersState) => void;
  /** Called when a message is received */
  onMessage?: (event: MessageEvent) => void;
  /** Called when the WebSocket connection is opened */
  onOpen?: (event: Event) => void;
  /** Called when the WebSocket connection is closed */
  onClose?: (event: CloseEvent) => void;
  /** Called when a WebSocket error occurs */
  onError?: (event: Event) => void;
  host?: string;
};

/**
 * SolidJS primitive for connecting to an Agent
 */
export function createAgent<State = unknown>(
  options: CreateAgentOptions<State> | Accessor<CreateAgentOptions<State>>
): AgentClient<State> & {
  agent: string;
  name: string;
  call: UntypedAgentMethodCall;
  stub: UntypedAgentStub;
};
export function createAgent<
  AgentT extends {
    get state(): State;
  },
  State
>(
  options: CreateAgentOptions<State> | Accessor<CreateAgentOptions<State>>
): AgentClient<State> & {
  agent: string;
  name: string;
  call: AgentMethodCall<AgentT>;
  stub: AgentStub<AgentT>;
};
export function createAgent<State>(
  optionsOrAccessor:
    | CreateAgentOptions<State>
    | Accessor<CreateAgentOptions<State>>
): AgentClient<State> & {
  agent: string;
  name: string;
  call: UntypedAgentMethodCall | AgentMethodCall<unknown>;
  stub: UntypedAgentStub;
} {
  // Normalize options to an accessor
  const getOptions =
    typeof optionsOrAccessor === "function"
      ? optionsOrAccessor
      : () => optionsOrAccessor;

  // Track the current client - use a ref-like pattern to avoid reactive loops
  let clientRef: AgentClient<State> | undefined = undefined;
  const [clientVersion, setClientVersion] = createSignal(0);

  // Resource for async query - only track agent and name for identity
  const [query] = createResource(
    () => {
      const opts = untrack(getOptions);
      return { query: opts.query, agent: opts.agent, name: opts.name };
    },
    async ({ query }) => {
      if (typeof query === "function") {
        return await query();
      }
      return query;
    }
  );

  createEffect(() => {
    const opts = getOptions();
    const resolvedQuery = query();

    // If query is a function and loading, wait
    if (typeof opts.query === "function" && query.loading) return;

    // Disconnect previous client
    if (clientRef) {
      clientRef.close();
    }

    const newClient = new AgentClient<State>({
      ...opts,
      host: opts.host || window.location.host,
      query: resolvedQuery as Record<string, string | undefined>
    });

    // Wire up all WebSocket event handlers
    if (opts.onOpen) {
      newClient.addEventListener("open", opts.onOpen);
    }
    if (opts.onClose) {
      newClient.addEventListener("close", opts.onClose);
    }
    if (opts.onError) {
      newClient.addEventListener("error", opts.onError);
    }
    if (opts.onMessage) {
      newClient.addEventListener("message", opts.onMessage);
    }

    // Handle MCP server state updates
    if (opts.onMcpUpdate) {
      newClient.addEventListener("message", (event) => {
        if (typeof event.data === "string") {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === MessageType.CF_AGENT_MCP_SERVERS) {
              opts.onMcpUpdate?.(parsed.mcp);
            }
          } catch {
            // Ignore parse errors
          }
        }
      });
    }

    clientRef = newClient;
    setClientVersion((v) => v + 1); // Trigger updates for consumers
  });

  onCleanup(() => {
    clientRef?.close();
  });

  // Proxy to delegate to the current client instance
  // IMPORTANT: Use untrack to avoid reactive loops in proxy getters
  // biome-ignore lint/suspicious/noExplicitAny: proxy needs any for dynamic method access
  const proxy = new Proxy({} as any, {
    get: (_target, prop) => {
      // Read version to establish reactivity, but untrack the client access
      clientVersion();

      const c = clientRef;

      if (!c && prop === "agent") return untrack(getOptions).agent;
      if (!c && prop === "name") return untrack(getOptions).name || "default";

      if (prop === "stub") {
        if (!c) return undefined;
        return createStubProxy(c.call.bind(c));
      }

      if (!c) {
        return undefined;
      }

      // biome-ignore lint/suspicious/noExplicitAny: dynamic property access
      const value = (c as any)[prop];
      if (typeof value === "function") {
        return value.bind(c);
      }
      return value;
    },
    set: (_target, prop, value) => {
      const c = clientRef;
      if (c) {
        // biome-ignore lint/suspicious/noExplicitAny: dynamic property access
        (c as any)[prop] = value;
        return true;
      }
      return false;
    }
  });

  return proxy;
}
