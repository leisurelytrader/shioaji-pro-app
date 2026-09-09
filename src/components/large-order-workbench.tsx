import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { History, Settings2, X } from 'lucide-react';
import {
    clearLargeOrderEvents,
    addHistoricalLargeOrderEvents,
    requestDesktopNotificationPermission,
    saveLargeOrderSettings,
    searchHistoricalLargeOrders,
    useLargeOrderEvents,
    useLargeOrderSettings,
    type DepthLevel,
    type HistoricalLargeOrderResult,
    type LargeOrderSettings,
} from '../lib/large-order';
import {
    loadLargeOrderWorkbenchState,
    saveLargeOrderWorkbenchState,
    type WorkbenchTab,
} from '../lib/large-order-workbench-state';
import {
    createLargeOrderConfigFile,
    normalizeImportedSettings,
    parseLargeOrderConfig,
    serializeLargeOrderConfig,
} from '../lib/large-order-config';
import * as styles from './large-order-workbench.css';

const LEVELS: DepthLevel[] = [1, 2, 3, 4, 5];

function queryTime(value: string, fallback: number) {
    if (!value) return new Date(fallback).toISOString();
    const withSeconds = value.length === 16 ? `${value}:00` : value;
    return new Date(`${withSeconds}+08:00`).toISOString();
}

export function LargeOrderWorkbench({ code, onClose }: { code: string; onClose: () => void }) {
    const savedSettings = useLargeOrderSettings(code);
    const events = useLargeOrderEvents().filter((event) => event.code === code);
    const [persistedState] = useState(loadLargeOrderWorkbenchState);
    const [tab, setTab] = useState<WorkbenchTab>(persistedState.tab);
    const [settings, setSettings] = useState<LargeOrderSettings>(savedSettings);
    const [from, setFrom] = useState(persistedState.from);
    const [to, setTo] = useState(persistedState.to);
    const [queryThreshold, setQueryThreshold] = useState(persistedState.queryThreshold || String(savedSettings.askThreshold));
    const [history, setHistory] = useState<HistoricalLargeOrderResult[]>([]);
    const [error, setError] = useState('');
    const [searching, setSearching] = useState(false);
    const [configMessage, setConfigMessage] = useState('');
    const importInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => setSettings(savedSettings), [savedSettings]);
    useEffect(() => {
        saveLargeOrderWorkbenchState({ tab, from, to, queryThreshold });
    }, [tab, from, to, queryThreshold]);
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const toggleLevel = (side: 'bid' | 'ask', level: DepthLevel) => {
        setSettings((current) => {
            const key = side === 'bid' ? 'bidLevels' : 'askLevels';
            const levels = current[key].includes(level)
                ? current[key].filter((item) => item !== level)
                : [...current[key], level].sort() as DepthLevel[];
            return { ...current, [key]: levels };
        });
    };

    const runHistorySearch = async () => {
        setSearching(true);
        setError('');
        try {
            const result = await searchHistoricalLargeOrders({
                symbol: code,
                from: queryTime(from, Date.now() - 86400000),
                to: queryTime(to, Date.now()),
                sides: ['bid', 'ask'],
                levels: LEVELS,
                minQuantity: Math.max(0, Number(queryThreshold) || 0),
            });
            setHistory(result.items);
            addHistoricalLargeOrderEvents(result.items);
        } catch (cause) {
            setHistory([]);
            setError(cause instanceof Error ? cause.message : '歷史資料服務尚未啟用');
        } finally {
            setSearching(false);
        }
    };

    const applySettings = () => {
        saveLargeOrderSettings(settings, code);
        setTab('monitor');
    };

    const exportConfig = () => {
        const file = createLargeOrderConfigFile(settings, { tab, from, to, queryThreshold });
        const url = URL.createObjectURL(new Blob([serializeLargeOrderConfig(file)], { type: 'application/json' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `shioaji-large-order-${code}-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        setConfigMessage('設定檔已匯出');
    };

    const importConfig = async (file: File) => {
        try {
            const imported = parseLargeOrderConfig(await file.text());
            const nextSettings = normalizeImportedSettings(imported.settings);
            saveLargeOrderSettings(nextSettings, code);
            saveLargeOrderWorkbenchState(imported.workbench);
            setSettings(nextSettings);
            setTab(imported.workbench.tab);
            setFrom(imported.workbench.from);
            setTo(imported.workbench.to);
            setQueryThreshold(imported.workbench.queryThreshold);
            setConfigMessage('設定檔已匯入並套用');
        } catch (cause) {
            setConfigMessage(cause instanceof Error ? cause.message : '設定檔無法匯入');
        }
    };

    return createPortal(
        <>
            <div className={styles.backdrop} onClick={onClose} />
            <aside className={styles.drawer} role='dialog' aria-label={`大單監控工作台 ${code}`}>
                <header className={styles.header}>
                    <div><strong>大單監控工作台</strong><span>{code} · 原生五檔／K 線</span></div>
                    <div className={styles.headerActions}>
                        <button onClick={exportConfig}>匯出 JSON</button>
                        <button onClick={() => importInputRef.current?.click()}>匯入 JSON</button>
                        <button className={styles.iconButton} onClick={onClose} aria-label='關閉'><X size={16} /></button>
                    </div>
                </header>
                <input ref={importInputRef} type='file' accept='application/json,.json' hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importConfig(file); event.target.value = ''; }} />
                {configMessage && <div className={styles.configMessage} role='status'>{configMessage}</div>}
                <nav className={styles.tabs} aria-label='大單功能分頁'>
                    <button className={tab === 'monitor' ? styles.activeTab : styles.tab} onClick={() => setTab('monitor')}><Settings2 size={14} /> 即時監控</button>
                    <button className={tab === 'history' ? styles.activeTab : styles.tab} onClick={() => setTab('history')}><History size={14} /> 歷史搜尋</button>
                </nav>
                <div className={styles.body}>
                    {tab === 'monitor' ? (
                        <section className={styles.section}>
                            <h3>即時五檔大單</h3>
                            <label><input type='checkbox' checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} /> 啟用大單監控</label>
                            <div className={styles.twoColumns}>
                                <label>委買門檻<input type='number' min='0' value={settings.bidThreshold} onChange={(e) => setSettings({ ...settings, bidThreshold: Number(e.target.value) })} />口</label>
                                <label>委賣門檻<input type='number' min='0' value={settings.askThreshold} onChange={(e) => setSettings({ ...settings, askThreshold: Number(e.target.value) })} />口</label>
                            </div>
                            <div className={styles.levels}><span>監控檔位</span>{LEVELS.map((level) => <label key={level}><input type='checkbox' checked={settings.bidLevels.includes(level) && settings.askLevels.includes(level)} onChange={() => { toggleLevel('bid', level); toggleLevel('ask', level); }} />{level}</label>)}</div>
                            <label>觸發方式<select value={settings.trigger} onChange={(e) => setSettings({ ...settings, trigger: e.target.value as LargeOrderSettings['trigger'] })}><option value='cross-above'>首次超過門檻</option><option value='always-above'>每次超過門檻</option></select></label>
                            <label>冷卻秒數<input type='number' min='0' value={settings.cooldownSeconds} onChange={(e) => setSettings({ ...settings, cooldownSeconds: Number(e.target.value) })} /></label>
                            <label><input type='checkbox' checked={settings.showOnChart} onChange={(e) => setSettings({ ...settings, showOnChart: e.target.checked })} /> 顯示於 K 線圖</label>
                            <label><input type='checkbox' checked={settings.sound} onChange={(e) => setSettings({ ...settings, sound: e.target.checked })} /> 警示音效</label>
                            <label><input type='checkbox' checked={settings.popup} onChange={(e) => setSettings({ ...settings, popup: e.target.checked })} /> 應用程式彈跳通知</label>
                            <label><input type='checkbox' checked={settings.desktop} onChange={async (e) => { if (!e.target.checked) { setSettings({ ...settings, desktop: false }); return; } const permission = await requestDesktopNotificationPermission(); setSettings({ ...settings, desktop: permission === 'granted' }); }} /> 桌面通知</label>
                            <button className={styles.primaryButton} onClick={applySettings}>套用監控設定</button>
                            <div className={styles.resultHeader}><span>即時事件 {events.length} 筆</span><button onClick={() => clearLargeOrderEvents(code)}>清除本商品標記</button></div>
                            {events.slice(-30).reverse().map((event) => <div className={styles.eventRow} key={event.id}><b className={event.side === 'bid' ? styles.bid : styles.ask}>{event.side === 'bid' ? '委買' : '委賣'}</b><span>{event.level}檔</span><strong>{event.quantity}口</strong><span>{event.time}</span></div>)}
                            {events.length === 0 && <p className={styles.empty}>等待五檔行情跨越門檻…</p>}
                        </section>
                    ) : (
                        <section className={styles.section}>
                            <h3>歷史五檔大單搜尋</h3>
                            <p className={styles.muted}>搜尋結果會與即時事件共用資料流，並同步顯示在原生 K 線圖。</p>
                            <label>開始<input type='datetime-local' value={from} onChange={(e) => setFrom(e.target.value)} /></label>
                            <label>結束<input type='datetime-local' value={to} onChange={(e) => setTo(e.target.value)} /></label>
                            <label>任意門檻<input type='number' min='0' value={queryThreshold} onChange={(e) => setQueryThreshold(e.target.value)} />口以上</label>
                            <button className={styles.primaryButton} disabled={searching} onClick={runHistorySearch}>{searching ? '搜尋中…' : '搜尋並顯示於 K 線圖'}</button>
                            <button onClick={() => { clearLargeOrderEvents(code); setHistory([]); }}>清除本商品標記</button>
                            {error && <p className={styles.error}>{error}</p>}
                            {history.length > 0 && <p className={styles.muted}>已載入 {history.length} 筆，K 線圖已同步標記</p>}
                            {history.slice(0, 50).map((item) => <div className={styles.eventRow} key={item.id}><b className={item.side === 'bid' ? styles.bid : styles.ask}>{item.side === 'bid' ? '委買' : '委賣'}</b><span>{item.level}檔</span><strong>{item.quantity}口</strong><span>{item.date} {item.time}</span></div>)}
                        </section>
                    )}
                </div>
            </aside>
        </>,
        document.body,
    );
}
