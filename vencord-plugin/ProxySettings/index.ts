/*
 * Vencord, a Discord client mod
 * ProxySettings plugin
 *
 * Lets you route Discord's own network traffic (API calls, gateway,
 * media/voice where applicable) through an HTTP/HTTPS/SOCKS4/SOCKS5
 * proxy or VPN endpoint, without changing your system-wide network
 * settings. Only Discord's Electron session is affected.
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Enable proxy for Discord's network traffic",
        default: false,
        onChange: applySettings
    },
    protocol: {
        type: OptionType.SELECT,
        description: "Proxy protocol",
        options: [
            { label: "HTTP", value: "http", default: true },
            { label: "HTTPS", value: "https" },
            { label: "SOCKS4", value: "socks4" },
            { label: "SOCKS5", value: "socks5" }
        ],
        onChange: applySettings
    },
    host: {
        type: OptionType.STRING,
        description: "Proxy host or IP address",
        default: "",
        onChange: applySettings
    },
    port: {
        type: OptionType.NUMBER,
        description: "Proxy port",
        default: 1080,
        onChange: applySettings
    },
    username: {
        type: OptionType.STRING,
        description: "Proxy username (optional, only used if the proxy requires auth)",
        default: ""
    },
    password: {
        type: OptionType.STRING,
        description: "Proxy password (optional, only used if the proxy requires auth)",
        default: ""
    },
    bypassList: {
        type: OptionType.STRING,
        description: "Comma separated list of hosts to bypass the proxy for (optional)",
        default: ""
    }
});

async function applySettings() {
    if (!IS_DISCORD_DESKTOP) return;

    const { enabled, protocol, host, port, username, password, bypassList } = settings.store;

    if (enabled && host && port) {
        await VencordNative.pluginHelpers.ProxySettings.setProxy(
            protocol,
            host,
            port,
            username,
            password,
            bypassList
        );
    } else {
        await VencordNative.pluginHelpers.ProxySettings.clearProxy();
    }
}

export default definePlugin({
    name: "ProxySettings",
    description: "Route Discord's network traffic through an HTTP/HTTPS/SOCKS4/SOCKS5 proxy or VPN endpoint. Only affects Discord, not your system.",
    authors: [Devs.Ven],

    settings,

    // Desktop-only: proxy is set on the Electron session in the main process.
    // On the web/browser build there is no way to control the underlying
    // network stack from a client mod, so the plugin is a no-op there.
    start() {
        if (!IS_DISCORD_DESKTOP) {
            console.warn("[ProxySettings] This plugin only works on Discord Desktop.");
            return;
        }
        applySettings();
    },

    stop() {
        if (!IS_DISCORD_DESKTOP) return;
        VencordNative.pluginHelpers.ProxySettings.clearProxy();
    }
});
