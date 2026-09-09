import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
    addHistoricalLargeOrderEvents,
    clearLargeOrderEvents,
    getLargeOrderEvents,
    ingestBidAskForLargeOrders,
    saveLargeOrderSettings,
    useLargeOrderEvents,
    type HistoricalLargeOrderResult,
} from '../src/lib/large-order';

const code = 'E2E1';
const base = { code, date: '2026-09-08', bid_price: ['100'], ask_price: ['101'] } as const;

function ChartMarkerFixture() {
    const events = useLargeOrderEvents().filter((event) => event.code === code);
    return <section aria-label='K線圖 marker fixture'><h2>K線圖</h2><div data-testid='marker-count'>{events.length}</div>{events.map((event) => <div data-testid='chart-marker' key={event.id}>{event.side === 'bid' ? '委買' : '委賣'} {event.quantity}口 {event.time}</div>)}</section>;
}

function DepthFixture() {
    const [status, setStatus] = useState('等待五檔事件');
    const liveCross = () => {
        ingestBidAskForLargeOrders({ ...base, time: '09:00:00', bid_volume: [10], ask_volume: [10] });
        ingestBidAskForLargeOrders({ ...base, time: '09:00:01', bid_volume: [250], ask_volume: [10] });
        setStatus('已模擬委買跨越 199 口');
    };
    const loadHistory = async () => {
        const response = await fetch('/api/private/depth-alerts?symbol=E2E1');
        const payload = await response.json() as { items: HistoricalLargeOrderResult[] };
        addHistoricalLargeOrderEvents(payload.items);
        setStatus(`已載入 ${payload.items.length} 筆歷史大單`);
    };
    return <section aria-label='五檔報價 fixture'><h2>五檔報價</h2><button onClick={liveCross}>模擬即時跨越</button><button onClick={loadHistory}>載入歷史大單</button><button onClick={() => { clearLargeOrderEvents(code); setStatus('已清除'); }}>清除標記</button><output data-testid='status'>{status}</output></section>;
}

function App() {
    useEffect(() => {
        saveLargeOrderSettings({
            enabled: true, bidThreshold: 199, askThreshold: 199, bidLevels: [1], askLevels: [1],
            trigger: 'cross-above', cooldownSeconds: 0, showOnChart: true, sound: false, popup: false, desktop: false,
        });
        return () => clearLargeOrderEvents(code);
    }, []);
    return <><h1>大單整合 E2E fixture</h1><DepthFixture /><ChartMarkerFixture /></>;
}

createRoot(document.getElementById('root')!).render(<App />);
