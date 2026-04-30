// Screen 1 — Tinder-style POI swipe voting.
// Uses pointer events for drag, falls back to button clicks for accessibility.

function SwipeScreen({ onComplete }) {
  const [idx, setIdx] = React.useState(0);
  const [drag, setDrag] = React.useState({ x: 0, y: 0, active: false, start: null });
  const [exiting, setExiting] = React.useState(null); // { dir: 'left'|'right'|'up', vote }
  const [votes, setVotes] = React.useState({}); // { poiId: 'veto'|'like'|'must' }
  const [showHint, setShowHint] = React.useState(true);
  const [complete, setComplete] = React.useState(false);

  const total = POIS.length;
  const remaining = total - idx;
  const current = POIS[idx];
  const next = POIS[idx + 1];

  // Drag handlers
  const onPointerDown = (e) => {
    if (exiting) return;
    setShowHint(false);
    setDrag({ x: 0, y: 0, active: true, start: { x: e.clientX, y: e.clientY } });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.active) return;
    setDrag(d => ({ ...d, x: e.clientX - d.start.x, y: e.clientY - d.start.y }));
  };
  const onPointerUp = () => {
    if (!drag.active) return;
    const { x, y } = drag;
    const H_THRESH = 90;
    const V_THRESH = 90;
    if (y < -V_THRESH && Math.abs(y) > Math.abs(x)) {
      commitVote('must', 'up');
    } else if (x < -H_THRESH) {
      commitVote('veto', 'left');
    } else if (x > H_THRESH) {
      commitVote('like', 'right');
    } else {
      setDrag({ x: 0, y: 0, active: false, start: null });
    }
  };

  const commitVote = (vote, dir) => {
    setVotes(v => ({ ...v, [current.id]: vote }));
    setExiting({ dir, vote });
    setDrag({ x: 0, y: 0, active: false, start: null });
    setTimeout(() => {
      if (idx + 1 >= total) {
        setComplete(true);
        setTimeout(() => onComplete?.(), 2800);
      } else {
        setIdx(i => i + 1);
      }
      setExiting(null);
    }, 340);
  };

  if (complete) return <ResultsPreview onGo={() => onComplete?.()} />;

  // Indicators for swipe intent
  const likeOp = Math.max(0, Math.min(1, drag.x / 120));
  const vetoOp = Math.max(0, Math.min(1, -drag.x / 120));
  const mustOp = Math.max(0, Math.min(1, -drag.y / 120));

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: WARM_BG, position: 'relative', overflow: 'hidden',
    }}>
      {/* top bar */}
      <div style={{ padding: '14px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: SLATE_SUB, letterSpacing: 0.3, fontWeight: 500 }}>
              投票中 · Day 1 候選池
            </div>
            <div style={{ fontSize: 17, color: SLATE, fontWeight: 700, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              北海岸放空團
              <span style={{ fontSize: 11, color: FOREST_LIGHT, fontWeight: 600, background: FOREST_PALE, padding: '2px 7px', borderRadius: 6 }}>5人</span>
            </div>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: FOREST, color: '#fff',
            padding: '7px 12px', borderRadius: 999,
            fontSize: 12, fontWeight: 600,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            <span style={{ opacity: 0.7 }}>還剩</span>
            <span style={{ fontSize: 14 }}>{remaining}</span>
            <span style={{ opacity: 0.7 }}>張</span>
          </div>
        </div>
        {/* progress bar */}
        <div style={{
          marginTop: 14, height: 4, borderRadius: 999,
          background: '#E2E8F0', overflow: 'hidden',
        }}>
          <div style={{
            width: `${(idx / total) * 100}%`, height: '100%',
            background: `linear-gradient(90deg, ${FOREST_LIGHT}, ${FOREST_MID})`,
            borderRadius: 999,
            transition: 'width 340ms cubic-bezier(.2,.8,.2,1)',
          }} />
        </div>
      </div>

      {/* card stack */}
      <div style={{
        flex: 1, position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px 12px 8px',
      }}>
        {/* 3rd card (barely visible) */}
        {POIS[idx + 2] && (
          <Card poi={POIS[idx + 2]} style={{
            transform: 'translateY(22px) scale(0.9)', opacity: 0.5,
            zIndex: 1, filter: 'blur(0.5px)',
          }} />
        )}
        {/* 2nd card (peeking) */}
        {next && (
          <Card poi={next} style={{
            transform: `translateY(12px) scale(0.95)`,
            opacity: 0.85, zIndex: 2,
          }} />
        )}
        {/* top card */}
        {current && (
          <Card
            poi={current}
            dragX={drag.x} dragY={drag.y}
            exiting={exiting}
            likeOp={likeOp} vetoOp={vetoOp} mustOp={mustOp}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{ zIndex: 3, cursor: 'grab' }}
          />
        )}
      </div>

      {/* actions */}
      <div style={{ padding: '4px 20px 10px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 22, paddingBottom: 8,
        }}>
          <ActionBtn
            onClick={() => commitVote('veto', 'left')}
            size={56} borderColor="#EF4444"
            bg="#fff"
            tooltip="否決（此景點不會進入行程）"
          ><IconX size={22} color="#EF4444" /></ActionBtn>
          <ActionBtn
            onClick={() => commitVote('must', 'up')}
            size={68}
            bg="#EAB308"
            borderColor="#EAB308"
            tooltip="必去！+5 票權重"
            filled
            elevated
          >
            <IconStar size={28} color="#fff" />
          </ActionBtn>
          <ActionBtn
            onClick={() => commitVote('like', 'right')}
            size={56} borderColor="#3B82F6"
            bg="#fff"
            tooltip="喜歡 +1 票"
          ><IconHeart size={22} color="#3B82F6" /></ActionBtn>
        </div>

        {/* gesture hint */}
        <div style={{
          height: 32, opacity: showHint ? 1 : 0,
          transition: 'opacity 300ms',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 14, fontSize: 11, color: SLATE_SUB, fontWeight: 500,
        }}>
          <span>← 否決</span>
          <span style={{ display: 'inline-block', animation: 'nav-handswipe 2.6s ease-in-out infinite' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M8 11V6a2 2 0 014 0v5m0 0V4a2 2 0 014 0v7m0 0V6a2 2 0 014 0v9a6 6 0 01-6 6h-3c-2 0-3.5-1-4.5-2.5L5 14" stroke={FOREST} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <span>↑ 必去</span>
          <span style={{ color: '#CBD5E1' }}>·</span>
          <span>→ 喜歡</span>
        </div>
      </div>
    </div>
  );
}

// ─── The POI card ───
function Card({
  poi, dragX = 0, dragY = 0, exiting = null,
  likeOp = 0, vetoOp = 0, mustOp = 0,
  onPointerDown, onPointerMove, onPointerUp,
  style = {},
}) {
  const L = LEVELS[poi.level];
  let transform = `translate(${dragX}px, ${dragY}px) rotate(${dragX * 0.06}deg)`;
  let transition = 'transform 0ms';
  if (exiting) {
    const dx = exiting.dir === 'left' ? -700 : exiting.dir === 'right' ? 700 : 0;
    const dy = exiting.dir === 'up' ? -900 : 0;
    transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.04}deg)`;
    transition = 'transform 340ms cubic-bezier(.5,0,.2,1), opacity 340ms';
  } else if (!dragX && !dragY) {
    transition = 'transform 260ms cubic-bezier(.2,.8,.2,1)';
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'absolute',
        width: 326, height: 448,
        borderRadius: 22,
        overflow: 'hidden',
        background: poi.photo,
        boxShadow: '0 24px 48px -12px rgba(15,23,42,0.35), 0 8px 16px -8px rgba(15,23,42,0.2)',
        transform, transition,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
        ...style,
      }}
    >
      {/* photo overlay patterns so gradient looks a bit more alive */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.2) 0%, transparent 50%), radial-gradient(ellipse at 80% 85%, rgba(0,0,0,0.2) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />

      {/* Level badge */}
      <div style={{ position: 'absolute', top: 14, right: 14 }}>
        <LevelPill level={poi.level} />
      </div>

      {/* Indoor badge */}
      {poi.indoor && (
        <div style={{ position: 'absolute', top: 14, left: 14,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'rgba(255,255,255,0.92)',
          color: FOREST,
          padding: '5px 9px', borderRadius: 999,
          fontSize: 11, fontWeight: 600,
        }}>
          <IconIndoor size={12} color={FOREST} /> 室內
        </div>
      )}

      {/* bottom gradient */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, transparent 45%, rgba(0,0,0,0.75) 100%)',
        pointerEvents: 'none',
      }} />

      {/* info block */}
      <div style={{
        position: 'absolute', left: 18, right: 18, bottom: 18,
        color: '#fff',
      }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 500, letterSpacing: 0.4, marginBottom: 4 }}>
          {poi.addr}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.15, marginBottom: 10, letterSpacing: -0.3 }}>
          {poi.name}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {poi.vibe.slice(0, 4).map(v => <Chip key={v}>{v}</Chip>)}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontStyle: 'italic', lineHeight: 1.4 }}>
          "{poi.desc}"
        </div>
      </div>

      {/* SWIPE FEEDBACK OVERLAYS */}
      <FeedbackOverlay tint="rgba(239,68,68,0.28)" label="VETO" icon={<IconX size={40} color="#fff" weight={3} />} opacity={vetoOp} align="left" color="#EF4444"/>
      <FeedbackOverlay tint="rgba(59,130,246,0.28)" label="LIKE" icon={<IconHeart size={40} color="#fff" filled />} opacity={likeOp} align="right" color="#3B82F6"/>
      <FeedbackOverlay tint="rgba(234,179,8,0.3)" label="MUST GO" icon={<IconStar size={40} color="#fff" />} opacity={mustOp} align="top" color="#EAB308"/>
    </div>
  );
}

function FeedbackOverlay({ tint, label, icon, opacity, align, color }) {
  const pos = align === 'left'
    ? { top: 32, left: 24, transform: `rotate(-14deg) scale(${0.85 + opacity * 0.2})` }
    : align === 'right'
      ? { top: 32, right: 24, transform: `rotate(14deg) scale(${0.85 + opacity * 0.2})` }
      : { top: '38%', left: '50%', transform: `translate(-50%,-50%) scale(${0.85 + opacity * 0.2})` };
  return (
    <>
      <div style={{
        position: 'absolute', inset: 0, background: tint,
        opacity, pointerEvents: 'none', transition: 'opacity 80ms',
      }} />
      <div style={{
        position: 'absolute', ...pos,
        opacity, pointerEvents: 'none', transition: 'opacity 80ms',
        background: 'rgba(255,255,255,0.15)',
        border: `3px solid ${color}`, color,
        padding: '10px 18px',
        borderRadius: 14,
        display: 'flex', alignItems: 'center', gap: 10,
        backdropFilter: 'blur(4px)',
      }}>
        <div style={{ color: '#fff', display: 'flex' }}>{icon}</div>
        <span style={{ fontWeight: 800, fontSize: 22, color: '#fff', letterSpacing: 1.5 }}>{label}</span>
      </div>
    </>
  );
}

function ActionBtn({ children, onClick, size, borderColor, bg = '#fff', tooltip, filled = false, elevated = false }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: size, height: size, borderRadius: '50%',
          background: bg,
          border: `2px solid ${borderColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: elevated
            ? '0 10px 24px -6px rgba(234,179,8,0.5), 0 3px 6px rgba(0,0,0,0.12)'
            : '0 2px 8px rgba(0,0,0,0.06)',
          transition: 'transform 120ms, box-shadow 160ms',
          transform: hover ? 'translateY(-2px) scale(1.04)' : 'none',
          padding: 0,
        }}
      >{children}</button>
      {tooltip && hover && (
        <div style={{
          position: 'absolute', bottom: size + 10, left: '50%', transform: 'translateX(-50%)',
          background: FOREST, color: '#fff',
          padding: '6px 10px', borderRadius: 8,
          fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
          zIndex: 20, pointerEvents: 'none',
          animation: 'nav-fade-up 160ms ease-out',
        }}>
          {tooltip}
          <div style={{
            position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%) rotate(45deg)',
            width: 8, height: 8, background: FOREST,
          }}/>
        </div>
      )}
    </div>
  );
}

// ── Voting-complete preview screen ──
function ResultsPreview({ onGo }) {
  const top5 = RESULTS.filter(r => !r.vetoed).slice(0, 5);
  return (
    <div style={{
      height: '100%', background: WARM_BG,
      display: 'flex', flexDirection: 'column',
      padding: '24px 20px 20px',
    }}>
      {/* checkmark */}
      <div style={{
        margin: '12px auto 8px', width: 88, height: 88,
        position: 'relative',
      }}>
        <svg width="88" height="88" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r="40" fill="none" stroke={FOREST_LIGHT} strokeWidth="4"
            strokeDasharray="251" strokeDashoffset="251"
            style={{ animation: 'nav-circle-draw 600ms ease-out forwards' }}/>
          <circle cx="44" cy="44" r="40" fill={FOREST_PALE} opacity="0.5"/>
          <path d="M28 46l10 10 22-22" stroke={FOREST} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="50" strokeDashoffset="50"
            style={{ animation: 'nav-check-draw 500ms 400ms ease-out forwards' }}/>
        </svg>
      </div>

      <div style={{ textAlign: 'center', animation: 'nav-fade-up 500ms 600ms backwards' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: SLATE, marginBottom: 4 }}>
          投票完成！
        </div>
        <div style={{ fontSize: 13, color: SLATE_SUB, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          等待其他成員
          <span style={{ display: 'inline-flex', gap: 3 }}>
            {[0,1,2].map(i => <span key={i} style={{
              width: 4, height: 4, borderRadius: '50%', background: FOREST_LIGHT,
              animation: `nav-dot-blink 1.2s ${i * 0.2}s infinite`,
            }}/>)}
          </span>
        </div>
      </div>

      {/* member status */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 8,
        marginTop: 18, marginBottom: 22,
        animation: 'nav-fade-up 500ms 700ms backwards',
      }}>
        {MEMBERS.map(m => {
          // you (u5) now done
          const member = m.id === 'u5' ? { ...m, done: true } : m;
          const waiting = !['u1','u2','u3','u5'].includes(m.id);
          return <Avatar key={m.id} member={{ ...member, done: !waiting }} size={34} pulse={waiting} />;
        })}
      </div>

      {/* top 5 preview */}
      <div style={{
        fontSize: 11, color: SLATE_SUB, textTransform: 'uppercase', letterSpacing: 1,
        fontWeight: 600, marginBottom: 10, textAlign: 'center',
        animation: 'nav-fade-up 500ms 800ms backwards',
      }}>你的前 5 名</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, animation: 'nav-fade-up 500ms 900ms backwards' }}>
        {top5.map((r, i) => (
          <div key={r.poi.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#fff', borderRadius: 12,
            padding: '8px 12px',
            border: '1px solid #EEF2EF',
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: i === 0 ? FOREST : FOREST_PALE,
              color: i === 0 ? '#fff' : FOREST,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
            }}>{i+1}</div>
            <div style={{ width: 32, height: 32, borderRadius: 7, background: r.poi.photo, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: SLATE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.poi.name}
              </div>
              <div style={{ fontSize: 10, color: SLATE_SUB }}>L{r.poi.level} · {LEVELS[r.poi.level].label}</div>
            </div>
            <div style={{
              fontSize: 13, fontWeight: 700, color: FOREST,
              background: FOREST_PALE, padding: '4px 8px', borderRadius: 8,
            }}>{r.score}</div>
          </div>
        ))}
      </div>

      <button onClick={onGo} style={{
        marginTop: 'auto', padding: '14px', borderRadius: 12,
        background: FOREST, color: '#fff', border: 'none',
        fontSize: 14, fontWeight: 600, cursor: 'pointer',
        animation: 'nav-fade-up 500ms 1100ms backwards',
      }}>查看完整結果</button>
    </div>
  );
}

Object.assign(window, { SwipeScreen, ResultsPreview });
