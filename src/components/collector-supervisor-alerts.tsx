import { useEffect } from 'react';
import { isTauri } from '../lib/tauri';
import { notify } from '../lib/trade';

type CollectorStatusEvent = {
    status: 'running' | 'terminated' | 'restarting' | 'failed';
    message: string;
    attempt: number;
};

export function CollectorSupervisorAlerts() {
    useEffect(() => {
        if (!isTauri) return;
        let active = true;
        let unlisten: (() => void) | undefined;
        void import('@tauri-apps/api/event').then(async ({ listen }) => {
            if (!active) return;
            unlisten = await listen<CollectorStatusEvent>('collector://status', ({ payload }) => {
                if (payload.status === 'running') {
                    notify({ kind: 'ok', title: '行情 Collector 已啟動', body: payload.message });
                } else if (payload.status === 'restarting') {
                    notify({ kind: 'err', title: '行情 Collector 異常，準備重啟', body: payload.message });
                } else if (payload.status === 'failed') {
                    notify({ kind: 'err', title: '行情 Collector 已停止', body: payload.message });
                } else if (payload.status === 'terminated') {
                    notify({ kind: 'err', title: '行情 Collector 已終止', body: payload.message });
                }
            });
        }).catch((error) => {
            notify({ kind: 'err', title: 'Collector 狀態監控失敗', body: String(error) });
        });
        return () => {
            active = false;
            unlisten?.();
        };
    }, []);
    return null;
}
