// Shared primitives used across all three screens.

const FOREST = '#1B4332';
const FOREST_MID = '#2D6A4F';
const FOREST_LIGHT = '#52B788';
const FOREST_PALE = '#D8F3DC';
const WARM_BG = '#faf9f5';
const SLATE = '#1E293B';
const SLATE_SUB = '#64748B';
const SLATE_BORDER = '#E2E8F0';

// Level badge — top-right of POI cards + inline in lists
function LevelPill({ level, size = 'md', style = {} }) {
  const L = LEVELS[level];
  const sz = size === 'sm'
    ? { fs: 10, pad: '3px 8px', dot: 5 }
    : { fs: 11, pad: '5px 10px', dot: 6 };
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: L.bg,
      color: '#fff',
      padding: sz.pad,
      borderRadius: 999,
      fontSize: sz.fs,
      fontWeight: 600,
      letterSpacing: 0.3,
      whiteSpace: 'nowrap',
      boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
      backdropFilter: 'blur(6px)',
      WebkitBackdropFilter: 'blur(6px)',
      ...style,
    }}>
      <span style={{
        width: sz.dot, height: sz.dot, borderRadius: '50%',
        background: '#fff', boxShadow: '0 0 0 1.5px rgba(255,255,255,0.4)',
      }} />
      L{level} · {L.label}
    </div>
  );
}

// Chip — used for vibe tags, score breakdown, etc.
function Chip({ children, border = 'rgba(255,255,255,0.6)', color = '#fff', bg = 'transparent', style = {} }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      border: `1px solid ${border}`,
      color,
      background: bg,
      padding: '4px 10px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 500,
      lineHeight: 1,
      whiteSpace: 'nowrap',
      ...style,
    }}>{children}</span>
  );
}

// Member avatar dot — uses initial + color
function Avatar({ member, size = 28, pulse = false }) {
  const initial = (member.name || '?')[0];
  return (
    <div style={{
      position: 'relative',
      width: size, height: size, borderRadius: '50%',
      background: member.done ? member.color : '#E2E8F0',
      color: member.done ? '#fff' : '#94A3B8',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 600,
      border: `2px solid ${WARM_BG}`,
      flexShrink: 0,
    }}>
      {initial}
      {pulse && !member.done && (
        <span style={{
          position: 'absolute', inset: -4, borderRadius: '50%',
          border: '2px solid #94A3B8', opacity: 0.5,
          animation: 'nav-pulse 1.4s ease-out infinite',
        }} />
      )}
    </div>
  );
}

// Action icons — hand-drawn, sized to fit the circle buttons
function IconX({ size = 22, color = '#EF4444', weight = 2.2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={weight} strokeLinecap="round"/>
    </svg>
  );
}
function IconHeart({ size = 22, color = '#3B82F6', filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'}>
      <path d="M12 20s-7-4.5-9-9c-1.5-3.5 1-7 4.5-7 2 0 3.5 1 4.5 2.5C13 5 14.5 4 16.5 4 20 4 22.5 7.5 21 11c-2 4.5-9 9-9 9z" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  );
}
function IconStar({ size = 24, color = '#EAB308', filled = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'}>
      <path d="M12 2.5l2.9 6.2 6.7.8-5 4.6 1.4 6.7L12 17.8l-6 3 1.4-6.7-5-4.6 6.7-.8L12 2.5z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}
function IconCheck({ size = 20, color = '#fff', weight = 2.5 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 12.5l5 5L20 6" stroke={color} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconRain({ size = 22, color = '#92400E' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M7 14a4 4 0 01-1-7.9 5 5 0 019.8 1.2A3.5 3.5 0 0117 14H7z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
function IconIndoor({ size = 14, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9z" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  );
}
function IconCrown({ size = 16, color = '#EAB308' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M3 19h18l-1.5-9-4 3-3.5-6-3.5 6-4-3L3 19z"/>
      <rect x="3" y="19.5" width="18" height="2" rx="0.5"/>
    </svg>
  );
}
function IconWarn({ size = 16, color = '#EF4444' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3l10 18H2L12 3z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M12 10v5M12 17.5v.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

// Global animation keyframes — injected once
function InjectAnimations() {
  return (
    <style>{`
      @keyframes nav-pulse {
        0% { transform: scale(1); opacity: 0.6; }
        100% { transform: scale(1.45); opacity: 0; }
      }
      @keyframes nav-handswipe {
        0%, 100% { transform: translateX(0) rotate(0deg); opacity: 0.55; }
        25% { transform: translateX(-18px) rotate(-10deg); opacity: 0.9; }
        75% { transform: translateX(18px) rotate(10deg); opacity: 0.9; }
      }
      @keyframes nav-check-draw {
        from { stroke-dashoffset: 40; }
        to { stroke-dashoffset: 0; }
      }
      @keyframes nav-circle-draw {
        from { stroke-dashoffset: 170; }
        to { stroke-dashoffset: 0; }
      }
      @keyframes nav-pop {
        0% { transform: scale(0.6); opacity: 0; }
        60% { transform: scale(1.08); }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes nav-fade-up {
        from { transform: translateY(12px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      @keyframes nav-rain {
        0% { transform: translateY(-8px); opacity: 0; }
        50% { opacity: 1; }
        100% { transform: translateY(8px); opacity: 0; }
      }
      @keyframes nav-dot-blink {
        0%, 40% { opacity: 0.25; }
        50% { opacity: 1; }
        100% { opacity: 0.25; }
      }
      .nav-scrollhide::-webkit-scrollbar { display: none; }
      .nav-scrollhide { scrollbar-width: none; }
    `}</style>
  );
}

Object.assign(window, {
  FOREST, FOREST_MID, FOREST_LIGHT, FOREST_PALE, WARM_BG, SLATE, SLATE_SUB, SLATE_BORDER,
  LevelPill, Chip, Avatar,
  IconX, IconHeart, IconStar, IconCheck, IconRain, IconIndoor, IconCrown, IconWarn,
  InjectAnimations,
});
