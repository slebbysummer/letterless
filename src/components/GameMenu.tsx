// In-game menu: leave the case, or (host) end the mission for everyone.
import { useState } from 'react';
import { referee } from '../lib/api.ts';
import type { View } from '../lib/derive.ts';
import { Close } from './Icons.tsx';

type Confirming = null | 'leave' | 'end';

export function GameMenu({ v, onLeave }: { v: View; onLeave: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => { setOpen(false); setConfirming(null); setError(''); };

  const endMission = async () => {
    setBusy(true);
    try { await referee('end_game', { room_id: v.room.id }); close(); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  return (
    <>
      <button type="button" className="icon-btn menu-btn" aria-label="Case menu" aria-expanded={open} onClick={() => setOpen(true)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {open && (
        <div className="menu-backdrop" onClick={close}>
          <section className="menu-sheet" role="dialog" aria-label="Case menu" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ margin: '-6px -8px 0 0' }}>
              <span className="label">Case {v.room.code}</span>
              <button type="button" className="icon-btn" aria-label="Close menu" onClick={close}><Close /></button>
            </div>

            {confirming === null && (
              <>
                <button type="button" className="btn ghost" onClick={() => setConfirming('leave')}>Leave case</button>
                {v.isHost && <button type="button" className="btn ghost danger" onClick={() => setConfirming('end')}>End mission for everyone</button>}
                <button type="button" className="btn" onClick={close}>Keep playing</button>
              </>
            )}

            {confirming === 'leave' && (
              <>
                <p className="menu-text">
                  Leave this case? Your score stays on the board, marked as left.
                  {v.isHost ? ' Hosting passes to the next agent.' : ''}
                </p>
                <button type="button" className="btn danger-fill" onClick={onLeave}>Yes, leave case</button>
                <button type="button" className="btn ghost" onClick={() => setConfirming(null)}>Cancel</button>
              </>
            )}

            {confirming === 'end' && (
              <>
                <p className="menu-text">End the mission now? Everyone goes straight to the debrief with the scores so far.</p>
                <button type="button" className="btn danger-fill" disabled={busy} onClick={endMission}>Yes, end mission</button>
                <button type="button" className="btn ghost" onClick={() => setConfirming(null)}>Cancel</button>
              </>
            )}
            {error && <div className="error" role="alert">{error}</div>}
          </section>
        </div>
      )}
    </>
  );
}
