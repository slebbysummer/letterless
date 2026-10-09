import { useState } from 'react';
import { Chevron, Close } from '../components/Icons.tsx';
import { Stamp } from '../components/Stamp.tsx';
import { referee } from '../lib/api.ts';
import {
  DEFAULT_TURN_SECONDS, MAX_AGENTS, MIN_AGENTS, normalizeCaseCode, validateCodename,
} from '../../supabase/functions/_shared/rules.ts';

export interface Entered { room_id: string; code: string }

const LAST_NAME = 'letterless-codename';
const read = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export function Home({ onEnter, notice }: { onEnter: (e: Entered) => void; notice?: string }) {
  const [codename, setCodename] = useState(() => read(LAST_NAME));
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('case')?.toUpperCase().slice(0, 5) ?? '');
  const [howTo, setHowTo] = useState(false);
  const [error, setError] = useState(notice ?? '');
  const [busy, setBusy] = useState(false);

  const onCodename = (raw: string) => {
    const letters = raw.replace(/[^A-Za-z]/g, '');
    setError(letters !== raw ? 'Codenames are letters only. No spaces, numbers or emoji.' : '');
    setCodename(letters.slice(0, 10));
  };

  const go = async (action: 'create_room' | 'join_room') => {
    const name = validateCodename(codename);
    if (!name.ok) return setError(name.error);
    const body: Record<string, unknown> = { codename: name.value };
    if (action === 'join_room') {
      const c = normalizeCaseCode(code);
      if (!c.ok) return setError(c.error);
      body.code = c.value;
    }
    setBusy(true);
    setError('');
    try {
      const res = await referee<Entered>(action, body);
      write(LAST_NAME, name.value);
      onEnter(res);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="screen roomy" style={{ paddingTop: 36 }}>
      <div className="row">
        <span className="label">File ref. LL-001</span>
        <button type="button" aria-expanded={howTo} aria-controls="howto" onClick={() => setHowTo(!howTo)}
          style={{ minHeight: 44, display: 'flex', alignItems: 'center', padding: 0, marginRight: -4, border: 'none', background: 'transparent' }}>
          <Stamp rotate={5} size={15} pad="3px 9px">HOW TO PLAY<Chevron up={howTo} /></Stamp>
        </button>
      </div>

      {howTo && (
        <section id="howto" className="howto" aria-label="How to play">
          <div className="row" style={{ margin: '-10px -8px -4px 0' }}>
            <span className="label">Mission briefing</span>
            <button type="button" className="icon-btn" aria-label="Close how to play" onClick={() => setHowTo(false)}><Close /></button>
          </div>
          <ol>
            <li>Each round, every agent gets one turn as the clue-giver: {DEFAULT_TURN_SECONDS} seconds to get as many words cracked as possible.</li>
            <li>Describe each secret word without using any of its letters. Banned letters are locked on your keyboard.</li>
            <li>Every word has 3 to 5 different letters, so 3 to 5 keys are locked each time.</li>
            <li>Everyone else guesses as often as they like. Wrong guesses are visible to all.</li>
            <li>The first agent to crack a word wins a point, and so does the clue-giver. Then the next word appears.</li>
            <li>Stuck? You get one pass per turn.</li>
          </ol>
          <div className="tip">
            <strong>Tip:</strong> Watch which letters the clue-giver avoids. They might be in the word. Letters they
            do use can't be in it, so they fade on your keyboard.
          </div>
        </section>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
        <h1 className="title">Letterless</h1>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.4 }}><b>Your mission:</b> describe each word without any of its letters.</p>
      </div>

      <div className="card tilt" style={{ padding: '12px 14px', gap: 6 }} aria-label="Example briefing">
        <div className="label manila">Example briefing</div>
        <div style={{ fontSize: 15, lineHeight: 1.45, display: 'flex', flexWrap: 'wrap', columnGap: 12 }}>
          {['BIG QUICK ANIMAL', 'NAAAY!', 'GIDDY-UP!'].map((c) => <span key={c} style={{ whiteSpace: 'nowrap' }}>&gt; {c}</span>)}
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span className="typed" style={{ fontSize: 20, marginRight: 6 }}>= HORSE</span>
          {Array.from({ length: 5 }, (_, i) => <span key={i} style={{ width: 14, height: 18, background: 'var(--ink)' }} />)}
        </div>
      </div>

      <form style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }} onSubmit={(e) => { e.preventDefault(); go(code ? 'join_room' : 'create_room'); }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="agent" className="label">Your codename <span style={{ letterSpacing: '0.06em', textTransform: 'none' }}>(2–10 letters)</span></label>
          <div className="codename">
            <span>Agent</span>
            <input id="agent" type="text" placeholder="Fox" value={codename} maxLength={10} autoComplete="off" autoCorrect="off"
              autoCapitalize="words" spellCheck={false} onChange={(e) => onCodename(e.target.value)} />
          </div>
        </div>
        <button type="button" className="btn" disabled={busy} onClick={() => go('create_room')}>Open a new case</button>
        <div className="divider">OR JOIN ONE</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="code" className="label">Case number</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="code" className="case-input" type="text" placeholder="K7Q2M" value={code} maxLength={5} autoComplete="off"
              autoCorrect="off" autoCapitalize="characters" spellCheck={false}
              onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} />
            <button type="submit" className="btn ghost" style={{ height: 52, padding: '0 18px' }} disabled={busy}
              onClick={(e) => { e.preventDefault(); go('join_room'); }}>Join</button>
          </div>
        </div>
        <div className="error" role="alert">{error}</div>
      </form>

      <div className="bottom" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <span className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>{MIN_AGENTS} to {MAX_AGENTS} agents<br />Friends only</span>
        <Stamp rotate={-8} size={20}>TOP SECRET</Stamp>
      </div>
    </main>
  );
}
