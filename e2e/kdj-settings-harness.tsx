import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IndicatorSettingsModal } from '../src/components/indicator-dialog';
import { newInstance, type IndicatorInstance } from '../src/lib/indicator-defs';

function App() {
    const [inst, setInst] = useState<IndicatorInstance>(() => ({
        ...newInstance('private-kdj-divergence'),
        divergenceLabelSize: 1,
        divergenceArrowSize: 2,
    }));
    const [committed, setCommitted] = useState('未儲存');
    return (
        <main>
            <h1>KD 背離設定驗證</h1>
            <button onClick={() => setInst((current) => ({ ...current }))}>開啟設定</button>
            <output data-testid="committed">{committed}</output>
            <IndicatorSettingsModal
                inst={inst}
                timeframes={[{ label: '1分', minutes: 1 }, { label: '5分', minutes: 5 }]}
                onPatch={(patch) => setInst((current) => ({ ...current, ...patch }))}
                onRemove={() => setCommitted('removed')}
                onCommit={() => setCommitted(`${inst.divergenceLabelSize ?? 1}-${inst.divergenceArrowSize ?? 2}`)}
                onCancel={() => setCommitted('cancelled')}
            />
        </main>
    );
}

createRoot(document.getElementById('root')!).render(<App />);
