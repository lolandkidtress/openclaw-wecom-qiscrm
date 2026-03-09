import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setWeComQiscrmRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getWeComQiscrmRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("WeCom Qiscrm runtime not initialized");
  }
  return runtime;
}

// 兼容旧名称
export const getQiscrmRuntime = getWeComQiscrmRuntime;
export const setQiscrmRuntime = setWeComQiscrmRuntime;
