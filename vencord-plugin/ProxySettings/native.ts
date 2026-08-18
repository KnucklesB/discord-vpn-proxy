/*
 * Vencord, a Discord client mod
 * ProxySettings plugin - native (Electron main process) side
 *
 * This runs in Node/Electron's main process, so it has access to the
 * `session` module. We configure the proxy on Discord's default
 * session only, this does not touch the OS/system proxy settings,
 * so every other application on the machine is unaffected.
 */

import { IpcMainInvokeEvent, session } from "electron";

let authListenerAttached = false;
let currentCredentials: { username: string; password: string; } | null = null;

function attachAuthListener() {
    if (authListenerAttached) return;
    authListenerAttached = true;

    session.defaultSession.on("login", (event, details, authInfo, callback) => {
        if (!authInfo.isProxy || !currentCredentials) return;
        event.preventDefault();
        callback(currentCredentials.username, currentCredentials.password);
    });
}

export async function setProxy(
    _event: IpcMainInvokeEvent,
    protocol: string,
    host: string,
    port: number,
    username?: string,
    password?: string,
    bypassList?: string
) {
    if (!host || !port) return false;

    const scheme = protocol === "socks4" ? "socks4" : protocol === "socks5" ? "socks5" : protocol;
    const proxyRules = `${scheme}://${host}:${port}`;

    await session.defaultSession.setProxy({
        proxyRules,
        proxyBypassRules: bypassList && bypassList.trim().length > 0 ? bypassList : undefined
    });

    if (username) {
        currentCredentials = { username, password: password ?? "" };
        attachAuthListener();
    } else {
        currentCredentials = null;
    }

    return true;
}

export async function clearProxy(_event: IpcMainInvokeEvent) {
    currentCredentials = null;
    await session.defaultSession.setProxy({ proxyRules: "" });
    return true;
}
