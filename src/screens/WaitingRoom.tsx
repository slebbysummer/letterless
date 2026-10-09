import { useState } from 'react';
import { Copy } from '../components/Icons.tsx';
import { Stamp } from '../components/Stamp.tsx';
import { referee } from '../lib/api.ts';
import { agent, type View } from '../lib/derive.ts';
import { MAX_AGENTS, MIN_AGENTS, ROUND_OPTIONS, TURN_OPTIONS } from '../../supabase/functions/_shared/rules.ts';

const turnLabel = (secs: number) => (secs % 60 === 0 && secs > 60 ? `${secs / 60} min` : `${secs}s`);

export function WaitingRoom({ v, onLeave }: { v: View; onLeave: () => void }) {
  const { room, active, me, isHost } = v;
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const host = active.find((p) => p.id === room.host_player_id);
  const enough = active.length >= MIN_AGENTS;

  const shareText = `Join my Letterless case: ${room.code}`;
  const shareUrl = `${location.origin}/?case=${room.code}`;
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'Letterless', text: shareText, url: shareUrl }); } catch { /* closed the sheet */ }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`, '_blank', 'noopener');
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(`Copy failed. The case number is ${room.code}.`);
    }
  };

  const act = async (action: string, body: Record<string, unknown> = {}) => {
    setError('');
    setBusy(true);
    try { await referee(action, { room_id: room.id, ...body }); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  const Setting = ({ label, options, value, field, format }: { label: string; options: readonly number[]; value: number; field: string; format: (n: number) => string }) => (
    <div className="row" style={{ gap: 12 }}>
      <span style={{ fontSize: 15 }}>{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" aria-pressed={o === value} disabled={!isHost || busy}
            onClick={() => o !== value && act('update_settings', { [field]: o })}>{format(o)}</button>
        ))}
      </div>
    </div>
  );

  return (
    <main className="screen roomy" style={{ gap: 20, paddingTop: 36 }}>
      <div className="row">
        <button type="button" className="linkish" onClick={onLeave}>&lt; Leave case</button>
        <span className="label">Waiting room</span>
      </div>

      <section className="card" style={{ padding: 18 }}>
        <div className="label manila">Case number</div>
        <div className="row" style={{ gap: 12 }}>
          <span className="case-number" data-testid="case-code">{room.code}</span>
          <button type="button" className="copy-btn" aria-label="Copy case number" onClick={copy}>
            {copied ? <span style={{ fontSize: 11, fontWeight: 700 }}>OK</span> : <Copy />}
          </button>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--manila-text)' }}>{copied ? 'Copied. ' : ''}Send this to your agents so they can join.</div>
          <button type="button" className="btn ghost" style={{ height: 40, fontSize: 15, padding: '0 14px', flexShrink: 0 }} onClick={share}>Share</button>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="row label"><span>Agents on file</span><span>{active.length} / {MAX_AGENTS}</span></div>
        <div className="list agents">
          {active.map((p) => (
            <div key={p.id}>
              <span>{agent(p)}{p.id === me?.id ? <span className="muted" style={{ fontSize: 14 }}> (you)</span> : null}</span>
              {p.id === room.host_player_id
                ? <Stamp rotate={-4} size={12} pad="1px 6px">HOST</Stamp>
                : <span className="muted small">ready</span>}
            </div>
          ))}
          {active.length < MAX_AGENTS && <div className="awaiting">awaiting agent</div>}
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="label">Mission settings {isHost ? '(host)' : `(set by ${agent(host)})`}</div>
        <Setting label="Rounds" options={ROUND_OPTIONS} value={room.rounds} field="rounds" format={String} />
        <Setting label="Turn length" options={TURN_OPTIONS} value={room.turn_seconds} field="turn_seconds" format={turnLabel} />
        <div className="muted small" style={{ lineHeight: 1.4 }}>
          Every agent gives clues once per round, cracking as many words as they can. One pass per turn. Emoji are redacted.
        </div>
      </section>

      <div className="bottom">
        <div className="error" role="alert">{error}</div>
        {isHost ? (
          <button type="button" className="btn big" disabled={!enough || busy} onClick={() => act('start_game')}>Begin mission</button>
        ) : (
          <button type="button" className="btn big" disabled>Waiting for the host</button>
        )}
        <div className="center muted" style={{ fontSize: 12 }}>
          {enough ? (isHost ? 'All agents ready' : `${agent(host)} will begin the mission`) : `Needs at least ${MIN_AGENTS} agents`}
        </div>
      </div>
    </main>
  );
}
