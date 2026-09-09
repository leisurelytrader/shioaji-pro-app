export type WorkbenchTab = 'monitor' | 'history';

export interface LargeOrderWorkbenchState {
    tab: WorkbenchTab;
    from: string;
    to: string;
    queryThreshold: string;
}

export const DEFAULT_LARGE_ORDER_WORKBENCH_STATE: LargeOrderWorkbenchState = {
    tab: 'monitor',
    from: '',
    to: '',
    queryThreshold: '',
};

const STORAGE_KEY = 'sj-pro-large-order-workbench-v1';

export function loadLargeOrderWorkbenchState(): LargeOrderWorkbenchState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_LARGE_ORDER_WORKBENCH_STATE };
        const parsed = JSON.parse(raw) as Partial<LargeOrderWorkbenchState>;
        return {
            tab: parsed.tab === 'history' ? 'history' : 'monitor',
            from: typeof parsed.from === 'string' ? parsed.from : '',
            to: typeof parsed.to === 'string' ? parsed.to : '',
            queryThreshold: typeof parsed.queryThreshold === 'string' ? parsed.queryThreshold : '',
        };
    } catch {
        return { ...DEFAULT_LARGE_ORDER_WORKBENCH_STATE };
    }
}

export function saveLargeOrderWorkbenchState(state: LargeOrderWorkbenchState): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Storage can be disabled or unavailable in a private webview.
    }
}

export function clearLargeOrderWorkbenchState(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Ignore unavailable storage.
    }
}
