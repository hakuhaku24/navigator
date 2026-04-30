// Screen 3 — Weather swap alert + suggestion modal.

function WeatherScreen({ onGo }) {
  const [dismissed, setDismissed] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(true);
  const [decisions, setDecisions] = React.useState({}); // idx -> 'accept' | 'keep' | 'custom'
  const [applied, setApplied] = React.useState(false);

  const acceptAll = () => {
    const all = {};
    SWAPS.forEach((_, i) => all[i] = 'accept');
    setDecisions(all);
    setTimeout(() => { setApplied(true); setModalOpen(false); }, 500);
  };

  if (applied) return <TripAppliedView onGo={onGo} decisions={decisions} />;

  return (
    <div style={{
      height: '100%', background: WARM_BG,
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Trigger banner + mock trip-detail backdrop */}
      <TripBackdrop dismissed={dismissed} onOpen={() => setModalOpen(true)} onDismiss={() => setDismissed(true)} />

      {/* Bottom-sheet modal */}
      {modalOpen && (
        <SwapModal
          decisions={decisions} setDecisions={setDecisions}
          onClose={() => setModalOpen(false)}
          onAcceptAll={acceptAll}
        />
      )}
    </div>
  );
}

function TripBackdrop({ dismissed, onOpen, onDismiss }) {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
    }}>
      {/* top bar */}
      <div style={{
        padding: '16px 18px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 11, color: SLATE_SUB, fontWeight: 500 }}>行程 · 2天1夜</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: SLATE, letterSpacing: -0.3 }}>北海岸放空團</div>
        </div>
        <div style={{
          display: 'inline-flex', gap: -4,
        }}>
          {MEMBERS.slice(0, 3).map((m, i) => (
            <div key={m.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
              <Avatar member={{ ...m, done: true }} size={26} />
            </div>
          ))}
        </div>
      </div>

      {/* amber warning banner */}
      {!dismissed && (
        <div style={{ padding: '0 14px 10px' }}>
          <WeatherBanner onOpen={onOpen} onDismiss={onDismiss} />
        </div>
      )}

      {/* day tabs */}
      <div style={{ padding: '0 18px 4px', display: 'flex', gap: 6 }}>
        {['Day 1 · 週六', 'Day 2 · 週日'].map((d, i) => (
          <div key={i} style={{
            padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: i === 1 ? FOREST : '#fff',
            color: i === 1 ? '#fff' : SLATE_SUB,
            border: i === 1 ? 'none' : '1px solid #E2E8F0',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            {d}
            {i === 1 && <IconRain size={12} color="#fff" />}
          </div>
        ))}
      </div>

      {/* timeline */}
      <div style={{ flex: 1, padding: '12px 18px', overflowY: 'auto' }} className="nav-scrollhide">
        {[
          { time: '09:00', poi: POIS[0], affected: true },
          { time: '11:30', poi: POIS[2], affected: true },
          { time: '14:00', poi: POIS[4], affected: true },
          { time: '17:30', poi: POIS[6], affected: false },
        ].map((stop, i) => (
          <TimelineStop key={i} stop={stop} last={i === 3} />
        ))}
      </div>
    </div>
  );
}

function WeatherBanner({ onOpen, onDismiss }) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%)',
      borderRadius: 14, padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 20px -6px rgba(245,158,11,0.45)',
      animation: 'nav-fade-up 400ms ease-out',
    }}>
      {/* rain dots */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.25 }}>
        {[10, 45, 78, 95, 130, 180, 230, 270, 310].map((x, i) => (
          <span key={i} style={{
            position: 'absolute', left: x, top: 4,
            width: 1.5, height: 10, background: '#fff', borderRadius: 2,
            animation: `nav-rain ${1.2 + (i % 3) * 0.3}s ${i * 0.08}s linear infinite`,
          }} />
        ))}
      </div>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: 'rgba(255,255,255,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <IconRain size={20} color="#fff" />
      </div>
      <div style={{ flex: 1, minWidth: 0, color: '#fff' }}>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
          明天下午 · 降雨機率 85%
        </div>
        <div style={{ fontSize: 11, opacity: 0.95, marginTop: 2 }}>
          3 個戶外景點建議調整 · 點查看智能備案
        </div>
      </div>
      <button onClick={onOpen} style={{
        background: '#fff', color: '#92400E',
        border: 'none', padding: '7px 12px', borderRadius: 8,
        fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
      }}>查看建議</button>
      <button onClick={onDismiss} style={{
        width: 22, height: 22, borderRadius: '50%',
        background: 'rgba(255,255,255,0.2)',
        border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <IconX size={12} color="#fff" weight={2.5} />
      </button>
    </div>
  );
}

function TimelineStop({ stop, last }) {
  const { time, poi, affected } = stop;
  return (
    <div style={{ display: 'flex', gap: 12, paddingBottom: 14, position: 'relative' }}>
      {/* dot + line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: affected ? '#F59E0B' : FOREST,
          border: `2px solid ${affected ? '#FEF3C7' : FOREST_PALE}`,
          boxShadow: `0 0 0 2px ${affected ? '#F59E0B' : FOREST}`,
          marginTop: 14,
        }} />
        {!last && <div style={{ flex: 1, width: 1.5, background: '#E2E8F0', marginTop: 2 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: SLATE_SUB, fontWeight: 600, letterSpacing: 0.5 }}>{time}</div>
        <div style={{
          marginTop: 4,
          background: '#fff', borderRadius: 12,
          border: affected ? '1px solid #FCD34D' : '1px solid #EEF2EF',
          padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 10,
          opacity: affected ? 0.85 : 1,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            background: poi.photo, flexShrink: 0,
            filter: affected ? 'grayscale(0.3)' : 'none',
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: SLATE, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {poi.name}
            </div>
            <div style={{ fontSize: 10, color: SLATE_SUB, marginTop: 2 }}>
              L{poi.level} · {poi.indoor ? '室內' : '戶外'}
            </div>
          </div>
          {affected && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: '#FEF3C7', color: '#92400E',
              fontSize: 10, fontWeight: 700,
              padding: '4px 7px', borderRadius: 6,
            }}>
              <IconRain size={10} color="#92400E" /> 受影響
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bottom-sheet swap modal ───
function SwapModal({ decisions, setDecisions, onClose, onAcceptAll }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }}>
      {/* backdrop */}
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(15,23,42,0.45)',
        animation: 'nav-fade-up 200ms ease-out',
      }} />
      {/* sheet */}
      <div style={{
        position: 'relative', background: WARM_BG,
        borderRadius: '22px 22px 0 0',
        maxHeight: '88%', display: 'flex', flexDirection: 'column',
        animation: 'nav-fade-up 320ms cubic-bezier(.2,.8,.2,1)',
        boxShadow: '0 -20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* grabber */}
        <div style={{ padding: '10px 0 4px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#CBD5E1' }} />
        </div>

        {/* header */}
        <div style={{ padding: '4px 20px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'linear-gradient(135deg, #FBBF24, #F59E0B)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <IconRain size={20} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: SLATE, letterSpacing: -0.2 }}>
                  天氣應變建議
                </div>
                <div style={{ fontSize: 11, color: SLATE_SUB, marginTop: 1 }}>
                  Day 2 · 週日 14:00–18:00
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{
              width: 30, height: 30, borderRadius: '50%',
              background: '#fff', border: '1px solid #E2E8F0',
              cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IconX size={14} color={SLATE_SUB} />
            </button>
          </div>
          {/* weather detail card */}
          <div style={{
            marginTop: 12,
            background: '#fff', border: '1px solid #EEF2EF',
            borderRadius: 12, padding: '10px 12px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
              <WeatherGlyph />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: SLATE }}>
                  85% 降雨 · 18°C
                </div>
                <div style={{ fontSize: 11, color: SLATE_SUB }}>
                  中央氣象署 · 北海岸區
                </div>
              </div>
            </div>
            <div style={{
              padding: '4px 8px', background: FOREST_PALE, color: FOREST,
              borderRadius: 6, fontSize: 10, fontWeight: 700,
            }}>自動偵測</div>
          </div>
        </div>

        {/* swap list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px' }} className="nav-scrollhide">
          {SWAPS.map((swap, i) => (
            <SwapCard
              key={i} swap={swap}
              decision={decisions[i]}
              onDecide={(d) => setDecisions(prev => ({ ...prev, [i]: d }))}
            />
          ))}
        </div>

        {/* footer actions */}
        <div style={{
          padding: '12px 20px 24px',
          background: '#fff',
          borderTop: '1px solid #EEF2EF',
          display: 'flex', gap: 8,
        }}>
          <button onClick={onClose} style={{
            padding: '12px 14px', borderRadius: 10,
            background: '#fff', color: SLATE_SUB,
            border: '1px solid #E2E8F0',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>手動調整</button>
          <button onClick={onAcceptAll} style={{
            flex: 1, padding: '12px', borderRadius: 10,
            background: FOREST, color: '#fff', border: 'none',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            boxShadow: '0 6px 16px -4px rgba(27,67,50,0.35)',
          }}>
            <IconCheck size={14} /> 全部接受建議
          </button>
        </div>
      </div>
    </div>
  );
}

function WeatherGlyph() {
  return (
    <div style={{
      position: 'relative', width: 34, height: 34,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #93C5FD, #60A5FA)',
      borderRadius: 10,
    }}>
      <IconRain size={18} color="#fff" />
      {[-6, 0, 6].map((x, i) => (
        <span key={i} style={{
          position: 'absolute', left: 17 + x, bottom: 2,
          width: 1.5, height: 6, background: 'rgba(255,255,255,0.8)', borderRadius: 2,
          animation: `nav-rain 1.4s ${i * 0.25}s linear infinite`,
        }} />
      ))}
    </div>
  );
}

function SwapCard({ swap, decision, onDecide }) {
  const accepted = decision === 'accept';
  const kept = decision === 'keep';
  return (
    <div style={{
      background: '#fff', borderRadius: 14,
      border: accepted ? `1.5px solid ${FOREST_LIGHT}` : kept ? '1.5px solid #E2E8F0' : '1px solid #EEF2EF',
      padding: 12, marginBottom: 10,
      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      transition: 'all 200ms',
    }}>
      {/* swap pair */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
        {/* original */}
        <SwapTile
          poi={swap.original} side="original"
          reason={swap.reasonOld}
          dim={accepted}
        />
        {/* arrow */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '0 2px', minWidth: 22,
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: accepted ? FOREST_LIGHT : FOREST_PALE,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 200ms',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M13 6l6 6-6 6" stroke={accepted ? '#fff' : FOREST} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ fontSize: 8, color: SLATE_SUB, fontWeight: 700, marginTop: 4, letterSpacing: 0.5 }}>SWAP</div>
        </div>
        {/* replacement */}
        <SwapTile
          poi={swap.replacement} side="replacement"
          reason={swap.reasonNew}
          distance={swap.distance}
          highlight={accepted}
          dim={kept}
        />
      </div>

      {/* action row */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
        <ActionChip
          active={accepted} type="accept"
          onClick={() => onDecide('accept')}
          label="接受替換" icon={<IconCheck size={12} color={accepted ? '#fff' : FOREST} />}
        />
        <ActionChip
          active={kept} type="keep"
          onClick={() => onDecide('keep')}
          label="保留原景點"
        />
        <button style={{
          marginLeft: 'auto',
          background: 'transparent', border: 'none',
          color: FOREST, fontSize: 11, fontWeight: 600,
          cursor: 'pointer', padding: '6px 4px',
          textDecoration: 'underline', whiteSpace: 'nowrap',
          flexShrink: 0, fontFamily: 'inherit',
        }}>自訂</button>
      </div>
    </div>
  );
}

function SwapTile({ poi, side, reason, distance, highlight, dim }) {
  const isOrig = side === 'original';
  return (
    <div style={{
      flex: 1, minWidth: 0,
      borderRadius: 10,
      background: highlight ? 'rgba(82,183,136,0.08)' : isOrig ? 'rgba(254,226,226,0.3)' : 'rgba(82,183,136,0.06)',
      border: `1px solid ${highlight ? FOREST_LIGHT : isOrig ? '#FECACA' : 'rgba(82,183,136,0.25)'}`,
      padding: 8,
      opacity: dim ? 0.5 : 1,
      transition: 'opacity 200ms',
      position: 'relative',
    }}>
      <div style={{
        width: '100%', height: 56, borderRadius: 6,
        background: poi.photo, position: 'relative',
        filter: isOrig ? 'grayscale(0.3)' : 'none',
      }}>
        <div style={{
          position: 'absolute', top: 4, right: 4,
          display: 'inline-flex', alignItems: 'center', gap: 3,
          background: isOrig ? 'rgba(239,68,68,0.95)' : 'rgba(82,183,136,0.95)',
          color: '#fff',
          fontSize: 9, fontWeight: 700,
          padding: '2px 6px', borderRadius: 4,
        }}>
          {isOrig ? <><IconWarn size={9} color="#fff" /> 受影響</> : <><IconIndoor size={9} color="#fff" /> 室內</>}
        </div>
      </div>
      <div style={{
        fontSize: 12, fontWeight: 600, color: SLATE, marginTop: 6,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{poi.name}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
        <LevelPill level={poi.level} size="sm" style={{ fontSize: 8, padding: '2px 5px' }} />
      </div>
      <div style={{ fontSize: 10, color: SLATE_SUB, lineHeight: 1.4, marginTop: 4 }}>
        {reason}
      </div>
      {distance && (
        <div style={{
          marginTop: 4, fontSize: 10, color: FOREST, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 3,
        }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
            <path d="M12 22s-8-7-8-14a8 8 0 0116 0c0 7-8 14-8 14z" stroke={FOREST} strokeWidth="2"/>
            <circle cx="12" cy="8" r="2.5" stroke={FOREST} strokeWidth="2"/>
          </svg>
          {distance}
        </div>
      )}
    </div>
  );
}

function ActionChip({ active, type, onClick, label, icon }) {
  const isAccept = type === 'accept';
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '7px 10px', borderRadius: 8,
      background: active ? (isAccept ? FOREST_LIGHT : '#F1F5F9') : '#fff',
      color: active ? (isAccept ? '#fff' : SLATE) : isAccept ? FOREST : SLATE_SUB,
      border: `1px solid ${active ? (isAccept ? FOREST_LIGHT : '#CBD5E1') : isAccept ? FOREST_PALE : '#E2E8F0'}`,
      fontSize: 11, fontWeight: 600, cursor: 'pointer',
      transition: 'all 160ms',
      whiteSpace: 'nowrap', flexShrink: 0,
      fontFamily: 'inherit',
    }}>
      {icon} {label}
    </button>
  );
}

function TripAppliedView({ onGo, decisions }) {
  const count = Object.values(decisions).filter(d => d === 'accept').length;
  return (
    <div style={{
      height: '100%', background: WARM_BG,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '60px 24px',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 20,
        background: `linear-gradient(135deg, ${FOREST_LIGHT}, ${FOREST_MID})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 12px 30px -8px rgba(82,183,136,0.5)',
        animation: 'nav-pop 500ms cubic-bezier(.2,.8,.2,1.4)',
      }}>
        <IconCheck size={36} color="#fff" weight={3} />
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: SLATE, marginTop: 18, letterSpacing: -0.3 }}>
        行程已更新
      </div>
      <div style={{ fontSize: 13, color: SLATE_SUB, marginTop: 6, textAlign: 'center', lineHeight: 1.5 }}>
        {count} 個景點已替換為室內備案<br/>
        Day 2 下午改走北投文化路線
      </div>
      <button onClick={onGo} style={{
        marginTop: 24, padding: '12px 24px', borderRadius: 12,
        background: FOREST, color: '#fff', border: 'none',
        fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}>查看更新後行程</button>
    </div>
  );
}

Object.assign(window, { WeatherScreen });
