// Screen 2 — Voting results + group consensus.

function ResultsScreen({ onGo }) {
  const [threshold, setThreshold] = React.useState(6); // score cutoff
  const total = MEMBERS.length;
  const done = MEMBERS.filter(m => m.id !== 'u5').length + 1; // you done
  const allDone = true;

  const alive = RESULTS.filter(r => !r.vetoed);
  const above = alive.filter(r => r.score >= threshold);
  const below = alive.filter(r => r.score < threshold);
  const vetoed = RESULTS.filter(r => r.vetoed);

  return (
    <div style={{
      height: '100%', background: WARM_BG, overflowY: 'auto',
      paddingBottom: 90,
    }} className="nav-scrollhide">
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: `linear-gradient(180deg, ${WARM_BG} 85%, transparent)`,
        padding: '18px 18px 10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: SLATE_SUB, fontWeight: 500, letterSpacing: 0.4 }}>
              北海岸放空團 · Day 1
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: SLATE, letterSpacing: -0.3, marginTop: 2 }}>
              投票結果
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: SLATE_SUB, fontWeight: 500 }}>
              {done}/{total} 人已完成
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              {MEMBERS.map(m => <Avatar key={m.id} member={{...m, done: m.id==='u5' ? true : m.done}} size={24} pulse={false} />)}
            </div>
          </div>
        </div>
        <div style={{
          marginTop: 12, padding: '8px 12px',
          background: FOREST_PALE, borderRadius: 10,
          fontSize: 12, color: FOREST, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ display: 'inline-flex', width: 16, height: 16, alignItems: 'center', justifyContent: 'center', background: FOREST, color: '#fff', borderRadius: '50%', fontSize: 10 }}>✓</span>
          全員已投票完成 · 共 {alive.length} 個候選景點進入排序
        </div>
      </div>

      {/* Veto warning banner */}
      {vetoed.length > 0 && (
        <div style={{ padding: '0 18px 10px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 10, padding: '10px 12px',
          }}>
            <IconWarn size={16} />
            <div style={{ flex: 1, fontSize: 12, color: '#991B1B' }}>
              <b>{vetoed[0].poi.name}</b> 被否決，已從候選移除
            </div>
          </div>
        </div>
      )}

      {/* Above-threshold (納入) */}
      <div style={{ padding: '2px 18px 8px' }}>
        <SectionHeader
          icon={<IconCrown size={14} color={FOREST} />}
          title="納入草稿行程"
          count={above.length}
          highlight
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {above.map((r, i) => <ResultRow key={r.poi.id} result={r} rank={i + 1} top={i === 0} />)}
        </div>
      </div>

      {/* Threshold line */}
      <div style={{ padding: '14px 18px 8px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px',
          background: '#FFFBEB',
          border: '1px dashed #F59E0B',
          borderRadius: 10,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11, fontWeight: 700, color: '#92400E',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#F59E0B">
              <path d="M2 12h20M12 2v20" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            門檻 ≥ {threshold}
          </div>
          <div style={{ flex: 1, fontSize: 11, color: '#92400E', opacity: 0.8 }}>
            低於此線不會進入草稿
          </div>
          <button
            onClick={() => setThreshold(t => t === 6 ? 3 : t === 3 ? 10 : 6)}
            style={{
              background: '#fff', border: '1px solid #FCD34D',
              borderRadius: 6, padding: '4px 8px',
              fontSize: 11, fontWeight: 600, color: '#92400E',
              cursor: 'pointer',
            }}>調整</button>
        </div>
      </div>

      {/* Below-threshold */}
      {below.length > 0 && (
        <div style={{ padding: '2px 18px 8px' }}>
          <SectionHeader title="備選池" count={below.length} muted />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {below.map((r, i) => <ResultRow key={r.poi.id} result={r} rank={above.length + i + 1} dim />)}
          </div>
        </div>
      )}

      {/* Vetoed */}
      {vetoed.length > 0 && (
        <div style={{ padding: '2px 18px 8px' }}>
          <SectionHeader title="已否決" count={vetoed.length} muted danger />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {vetoed.map(r => <ResultRow key={r.poi.id} result={r} vetoed />)}
          </div>
        </div>
      )}

      {/* sticky CTA */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: '14px 18px 24px',
        background: `linear-gradient(180deg, transparent, ${WARM_BG} 40%)`,
        display: 'flex', gap: 10, alignItems: 'center',
      }}>
        <button onClick={onGo} style={{
          flex: 1, padding: '14px', borderRadius: 12,
          background: FOREST, color: '#fff', border: 'none',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          boxShadow: '0 8px 20px -6px rgba(27,67,50,0.4)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" fill="rgba(255,255,255,0.2)"/>
          </svg>
          生成草稿行程
        </button>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, count, highlight, muted, danger }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      paddingTop: 10,
    }}>
      {icon && <div style={{ display: 'flex' }}>{icon}</div>}
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
        color: danger ? '#DC2626' : muted ? SLATE_SUB : FOREST,
      }}>{title}</div>
      <div style={{
        fontSize: 11, fontWeight: 600,
        background: highlight ? FOREST : muted ? '#E2E8F0' : danger ? '#FEE2E2' : FOREST_PALE,
        color: highlight ? '#fff' : muted ? SLATE_SUB : danger ? '#991B1B' : FOREST,
        padding: '2px 7px', borderRadius: 999,
      }}>{count}</div>
    </div>
  );
}

function ResultRow({ result, rank, top = false, dim = false, vetoed = false }) {
  const r = result;
  const poi = r.poi;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: vetoed ? 'rgba(254,226,226,0.35)' : '#fff',
      border: top ? `1.5px solid ${FOREST_LIGHT}` : '1px solid #EEF2EF',
      borderLeft: vetoed ? '3px solid #EF4444' : top ? `3px solid ${FOREST}` : '1px solid #EEF2EF',
      borderRadius: 12,
      padding: '10px 12px',
      opacity: dim ? 0.65 : 1,
      position: 'relative',
      boxShadow: top ? '0 4px 12px -4px rgba(27,67,50,0.15)' : 'none',
    }}>
      {top && (
        <div style={{
          position: 'absolute', top: -8, right: 10,
          background: '#EAB308', color: '#fff',
          fontSize: 10, fontWeight: 700,
          padding: '2px 8px', borderRadius: 999,
          display: 'inline-flex', alignItems: 'center', gap: 4,
          boxShadow: '0 2px 6px rgba(234,179,8,0.4)',
        }}>
          <IconCrown size={10} color="#fff" /> 最高共識
        </div>
      )}
      {rank && !vetoed && (
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: top ? FOREST : FOREST_PALE,
          color: top ? '#fff' : FOREST,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>{rank}</div>
      )}
      <div style={{
        width: 48, height: 48, borderRadius: 9,
        background: poi.photo, flexShrink: 0,
        filter: vetoed ? 'grayscale(0.8)' : 'none',
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: vetoed ? '#94A3B8' : SLATE,
          textDecoration: vetoed ? 'line-through' : 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {poi.name}
          {vetoed && (
            <span style={{
              background: '#FEE2E2', color: '#991B1B',
              fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4,
              textDecoration: 'none',
            }}>已否決</span>
          )}
        </div>
        <div style={{
          fontSize: 10, color: SLATE_SUB, marginTop: 2,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <LevelPill level={poi.level} size="sm" style={{ fontSize: 9, padding: '2px 6px' }} />
          <span>·</span>
          <span>{poi.addr.split('市')[1] || poi.addr}</span>
        </div>
        {/* vote breakdown */}
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          {r.stars > 0 && <MiniChip icon={<IconStar size={9} color="#EAB308" />} count={r.stars} color="#EAB308" bg="#FEF3C7" />}
          {r.hearts > 0 && <MiniChip icon={<IconHeart size={9} color="#3B82F6" filled />} count={r.hearts} color="#1E40AF" bg="#DBEAFE" />}
          {r.vetos > 0 && <MiniChip icon={<IconX size={9} color="#EF4444" />} count={r.vetos} color="#991B1B" bg="#FEE2E2" />}
        </div>
      </div>
      {!vetoed && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            background: top ? `linear-gradient(135deg, ${FOREST_LIGHT}, ${FOREST_MID})` : FOREST_PALE,
            color: top ? '#fff' : FOREST,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 700,
            boxShadow: top ? '0 4px 10px -2px rgba(82,183,136,0.5)' : 'none',
          }}>{r.score}</div>
          <div style={{ fontSize: 8, color: SLATE_SUB, fontWeight: 500, letterSpacing: 0.3 }}>分</div>
        </div>
      )}
    </div>
  );
}

function MiniChip({ icon, count, color, bg }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: bg, color,
      fontSize: 10, fontWeight: 700,
      padding: '2px 6px', borderRadius: 999,
    }}>
      {icon} ×{count}
    </span>
  );
}

Object.assign(window, { ResultsScreen });
