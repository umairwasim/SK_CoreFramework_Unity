/**
 * Alt Panel — Frame Inspector / A-B Compare / Leak / History / Events sekmeleri.
 */
import React from 'react';
import { useStore } from '../lib/store';
import FrameInspector from './FrameInspector';
import ComparePanel from './ComparePanel';
import LeakPanel from './LeakPanel';
import HistoryPanel from './HistoryPanel';
import EventsPanel from './EventsPanel';

const TABS: Array<{ id: any; label: string; title: string }> = [
  { id: 'flame', label: 'Frame Inspector', title: 'Deep frame analysis + flame graph' },
  { id: 'compare', label: 'A / B Compare', title: 'Metric and function diffs between two frames' },
  { id: 'leak', label: 'Leak Detector', title: 'Instantiate/Destroy balance and heap correlation' },
  { id: 'events', label: 'Custom Events', title: 'OmniProfiler.TrackEvent() timeline' },
  { id: 'history', label: 'Historical Analysis', title: 'SQLite: past sessions, aggregate stats, CSV export' },
];

export default function BottomPanel() {
  const tab = useStore((s) => s.inspectorTab);
  const setTab = useStore((s) => s.setTab);
  const compareA = useStore((s) => s.compareA);
  const compareB = useStore((s) => s.compareB);
  const findings = useStore((s) => s.findings);
  const leaks = useStore((s) => s.leaks);
  const events = useStore((s) => s.events);

  const riskyLeaks = leaks.filter((l) => l.spawned >= 30 && l.destroyRatio < 0.55 && l.slopePerSec > 0.35).length;

  return (
    <div className="panel bottom">
      <div className="panel-head">
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} title={t.title} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'compare' && compareA != null && compareB != null ? <span className="badge" style={{ marginLeft: 5 }}>2</span> : null}
              {t.id === 'leak' && riskyLeaks ? <span className="badge bad" style={{ marginLeft: 5 }}>{riskyLeaks}</span> : null}
              {t.id === 'events' && events.length ? <span className="badge" style={{ marginLeft: 5 }}>{events.length}</span> : null}
            </button>
          ))}
        </div>
        <div className="spacer" />
        {findings.length ? <span className="badge warn">{findings.length} findings</span> : null}
      </div>
      <div className="panel-body">
        {tab === 'flame' ? <FrameInspector /> : null}
        {tab === 'compare' ? <ComparePanel /> : null}
        {tab === 'leak' ? <LeakPanel /> : null}
        {tab === 'events' ? <EventsPanel /> : null}
        {tab === 'history' ? <HistoryPanel /> : null}
      </div>
    </div>
  );
}
