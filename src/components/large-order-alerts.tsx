import { useEffect } from 'react';
import {
    getLargeOrderSettings,
    subscribeLargeOrderAlerts,
    type LargeOrderEvent,
} from '../lib/large-order';
import { playAlert } from '../lib/sounds';
import { logNotice, notify } from '../lib/trade';

function message(event: LargeOrderEvent) {
    const side = event.side === 'bid' ? '委買' : '委賣';
    return {
        title: `大單警示｜${event.code} ${side}${event.level}檔`,
        body: `${event.quantity}口 @ ${event.price || '—'}｜${event.time}`,
    };
}

export function LargeOrderAlerts() {
    useEffect(() => {
        const off = subscribeLargeOrderAlerts((event) => {
            const settings = getLargeOrderSettings(event.code);
            const notice = message(event);
            if (settings.sound) playAlert();
            if (settings.popup) {
                notify({ kind: 'info', title: notice.title, body: notice.body });
            } else {
                logNotice({ kind: 'info', title: notice.title, body: notice.body });
            }
            if (
                settings.desktop &&
                typeof Notification !== 'undefined' &&
                Notification.permission === 'granted'
            ) {
                const popup = new Notification(notice.title, {
                    body: notice.body,
                    tag: event.id,
                    requireInteraction: false,
                });
                popup.onclick = () => window.focus();
            }
        });
        return () => {
            off();
        };
    }, []);
    return null;
}
