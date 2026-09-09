const STORAGE_KEY = 'sj-agent-harness-enabled';
const CHANGE_EVENT = 'sj-agent-harness-enabled-changed';

// The public desktop build attaches to the official external Shioaji server.
// It does not bundle the native Agent Harness commands, so an old localStorage
// value must never route human orders through `agent_harness_post`.
let enabledCache = false;

export function resolveAgentHarnessSetting(
    stored: boolean | null | undefined,
    safeDefaultMigrated = true,
): boolean {
    if (!safeDefaultMigrated) return true;
    return stored ?? true;
}

export function isAgentHarnessEnabled(): boolean {
    return enabledCache;
}

export function cacheAgentHarnessEnabled(enabled: boolean): void {
    const changed = enabledCache !== enabled;
    enabledCache = enabled;
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, String(enabled));
    }
    if (changed && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<boolean>(CHANGE_EVENT, {
            detail: enabled,
        }));
    }
}

export function subscribeAgentHarnessEnabled(
    listener: (enabled: boolean) => void,
): () => void {
    if (typeof window === 'undefined') return () => undefined;
    const handle = (event: Event) =>
        listener((event as CustomEvent<boolean>).detail);
    window.addEventListener(CHANGE_EVENT, handle);
    return () => window.removeEventListener(CHANGE_EVENT, handle);
}
