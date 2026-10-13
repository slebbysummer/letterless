// "How to play": one rule per page with a small visual, arrows and swipe to move.
import { useRef, useState, type ReactNode } from 'react';
import { Arrow, Close } from './Icons.tsx';
import { Stamp } from './Stamp.tsx';
import { DEFAULT_TURN_SECONDS, MAX_AGENTS, MIN_AGENTS } from '../../supabase/functions/_shared/rules.ts';

function MiniKeys({ rows, locked = '', dimmed = '' }: { rows: string[]; locked?: string; dimmed?: string }) {
  return (
    <div className="mini-keys" aria-hidden="true">
      {rows.map((r) => (
        <div key={r}>
          {[...r].map((ch) => (
            <span key={ch} className={locked.includes(ch) ? 'locked' : dimmed.includes(ch) ? 'dim' : undefined}>{ch}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

const Label = ({ children }: { children: ReactNode }) => <div className="label manila">{children}</div>;
const mins = `${Math.floor(DEFAULT_TURN_SECONDS / 60)}:${String(DEFAULT_TURN_SECONDS % 60).padStart(2, '0')}`;

const STEPS: { title: string; text: ReactNode; visual: ReactNode }[] = [
  {
    title: 'Get your agents together',
    text: <>Open a new case and send the case number to your friends ({MIN_AGENTS} to {MAX_AGENTS} agents). If someone has sent you a case number, type it in and tap Join.</>,
    visual: (
      <div className="howto-visual">
        <Label>Case number</Label>
        <div className="row"><span className="typed" style={{ fontSize: 30, letterSpacing: '0.2em' }}>K7Q2M</span><span className="mini-btn">Share</span></div>
        <div className="small" style={{ color: 'var(--manila-text)' }}>Got a number? Enter it under "Case number" and tap Join.</div>
      </div>
    ),
  },
  {
    title: 'Take turns giving clues',
    text: <>Each round, every agent gets one turn as the clue-giver: {DEFAULT_TURN_SECONDS} seconds to get as many words cracked as possible.</>,
    visual: (
      <div className="howto-visual">
        <div className="row"><strong>Your turn, Agent Fox</strong><span className="timer">{mins}</span></div>
        <div className="progress"><div style={{ width: '100%' }} /></div>
        <div style={{ display: 'flex', gap: 6 }}><span className="chip">CAT</span><span className="chip">SHARK</span><span className="chip">PIZZA</span></div>
      </div>
    ),
  },
  {
    title: 'No letters from the word',
    text: <>Describe each secret word without using any of its letters, which are locked on your keyboard. For example, to describe HORSE you can't use H, O, R, S or E. And trust us, you'll want to.</>,
    visual: (
      <div className="howto-visual">
        <Label>Only you can see this</Label>
        <div className="typed" style={{ fontSize: 34, letterSpacing: '0.08em' }}>HORSE</div>
        <MiniKeys rows={['QWERTYUIOP', 'ASDFGHJKL']} locked="HORSE" />
      </div>
    ),
  },
  {
    title: 'Everyone else guesses',
    text: <>Guess as often as you like. Wrong guesses are visible to everyone.</>,
    visual: (
      <div className="howto-visual">
        <div style={{ fontWeight: 700, fontSize: 18 }}>&gt; BIG QUICK ANIMAL</div>
        <div className="guess-strip">
          <span><s>dog</s> <small>Moth</small></span><span><s>lion</s> <small>Wren</small></span><span><s>cat</s> <small>Badger</small></span>
        </div>
      </div>
    ),
  },
  {
    title: 'First to crack it scores',
    text: <>The first agent to crack the word wins a point, and so does the clue-giver. Then the next word appears straight away. With just 2 agents, you play as a team: every cracked word adds to your shared score.</>,
    visual: (
      <div className="howto-visual">
        <div style={{ fontSize: 15 }}>HORSE, cracked by Agent Moth</div>
        <div className="row"><Stamp rotate={-6} size={14} pad="2px 8px">DECLASSIFIED</Stamp><strong>+1 each</strong></div>
      </div>
    ),
  },
  {
    title: 'Stuck? Pass',
    text: <>You get one pass per turn. The word is skipped and a new one appears.</>,
    visual: (
      <div className="howto-visual" style={{ alignItems: 'center' }}>
        <span className="mini-btn" style={{ fontSize: 18, padding: '8px 16px' }}>Pass · 1 left</span>
      </div>
    ),
  },
  {
    title: 'Clue-giver tip',
    text: <>Punctuation is never locked, so a dash can stand in for a banned letter. Describing HORSE? GALL-P could mean GALLOP.</>,
    visual: (
      <div className="howto-visual">
        <div style={{ fontWeight: 700, fontSize: 22 }}>&gt; GALL-P!</div>
        <MiniKeys rows={["!?,.'-"]} />
      </div>
    ),
  },
  {
    title: 'Guesser tip',
    text: <>Letters in any of the words your clue-giver sends can't be in their word, so these letters fade on your keyboard.</>,
    visual: (
      <div className="howto-visual">
        <div style={{ fontWeight: 700, fontSize: 18 }}>&gt; BIG QUICK ANIMAL</div>
        <MiniKeys rows={['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']} dimmed="BIGQUCKANML" />
      </div>
    ),
  },
];

export function HowToPlay({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const swipeX = useRef<number | null>(null);
  const last = STEPS.length - 1;
  const go = (n: number) => setStep(Math.max(0, Math.min(last, n)));
  const s = STEPS[step];

  return (
    <section id="howto" className="howto" aria-label="How to play" aria-roledescription="carousel"
      onPointerDown={(e) => { swipeX.current = e.clientX; }}
      onPointerUp={(e) => {
        if (swipeX.current === null) return;
        const dx = e.clientX - swipeX.current;
        swipeX.current = null;
        if (Math.abs(dx) > 50) go(step + (dx < 0 ? 1 : -1));
      }}>
      <div className="row" style={{ margin: '-10px -8px -4px 0' }}>
        <span className="label">Mission briefing · {step + 1} / {STEPS.length}</span>
        <button type="button" className="icon-btn" aria-label="Close how to play" onClick={onClose}><Close /></button>
      </div>

      <div className="howto-step" aria-live="polite" data-testid="howto-step">
        {s.visual}
        <h2 className="typed" style={{ margin: 0, fontSize: 22, fontWeight: 400 }}>{s.title}</h2>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>{s.text}</p>
      </div>

      <div className="row">
        {step > 0
          ? <button type="button" className="btn ghost howto-nav" aria-label="Previous rule" onClick={() => go(step - 1)}><Arrow left /></button>
          : <span className="howto-nav" aria-hidden="true" />}
        <div className="dots" aria-hidden="true">{STEPS.map((_, i) => <span key={i} className={i === step ? 'on' : undefined} />)}</div>
        {step < last
          ? <button type="button" className="btn howto-nav" aria-label="Next rule" onClick={() => go(step + 1)}><Arrow /></button>
          : <button type="button" className="btn" style={{ height: 44, fontSize: 16 }} onClick={onClose}>Got it</button>}
      </div>
    </section>
  );
}
