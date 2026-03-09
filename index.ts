import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { wecomQiscrmPlugin } from "./src/channel.js";
import { setWeComQiscrmRuntime } from "./src/runtime.js";

const plugin = {
  id: "wecom-qiscrm",
  name: "WeCom QISCRM",
  description: "WeCom QISCRM channel via Polling API",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    setWeComQiscrmRuntime(api.runtime);
    api.registerChannel({ plugin: wecomQiscrmPlugin });
    console.log("WeCom QISCRM channel plugin registered");
  },
};

export default plugin;
export { wecomQiscrmPlugin } from "./src/channel.js";
export type { QiscrmConfig, QiscrmAccountConfig, ResolvedQiscrmAccount } from "./src/types.js";
