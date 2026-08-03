// qa-tokens.jsx — Design tokens for QA Tools (both themes)

const THEME_A = {
  id: 'conservative',
  label: 'Clean Pro',
  // Backgrounds
  bg: '#F5F7FA',
  surface: '#FFFFFF',
  surface2: '#EEF2F7',
  // Rail
  rail: '#1A2233',
  railBorder: '#243044',
  railText: '#7A8BA8',
  railActive: 'rgba(59,130,246,0.14)',
  railActiveText: '#93C5FD',
  railActiveBorder: '#3B82F6',
  // Borders & text
  border: '#DDE3EB',
  borderSubtle: '#EEF2F7',
  text: '#111827',
  text2: '#6B7280',
  text3: '#9CA3AF',
  textOn: '#FFFFFF',
  // Accent
  accent: '#2563EB',
  accentHover: '#1D4ED8',
  accentLight: '#EFF6FF',
  accentText: '#1E40AF',
  accentBorder: '#BFDBFE',
  // Semantic
  pass: '#16A34A',
  passLight: '#F0FDF4',
  passBorder: '#BBF7D0',
  fail: '#DC2626',
  failLight: '#FEF2F2',
  failBorder: '#FECACA',
  warn: '#B45309',
  warnLight: '#FFFBEB',
  warnBorder: '#FDE68A',
  blocked: '#7C3AED',
  blockedLight: '#F5F3FF',
  blockedBorder: '#DDD6FE',
  skip: '#6B7280',
  skipLight: '#F9FAFB',
  skipBorder: '#E5E7EB',
  live: '#16A34A',
  liveGlow: 'rgba(22,163,74,0.3)',
  // Utility
  get: { bg:'#EFF6FF', text:'#1E40AF', border:'#BFDBFE' },
  post: { bg:'#F0FDF4', text:'#166534', border:'#BBF7D0' },
  put: { bg:'#FFFBEB', text:'#92400E', border:'#FDE68A' },
  del: { bg:'#FEF2F2', text:'#991B1B', border:'#FECACA' },
  patch: { bg:'#F5F3FF', text:'#5B21B6', border:'#DDD6FE' },
  // Fonts
  font: '"IBM Plex Sans", system-ui, -apple-system, sans-serif',
  mono: '"IBM Plex Mono", "SF Mono", "Menlo", monospace',
  // Effects
  shadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  shadowMd: '0 4px 12px rgba(0,0,0,0.08)',
  shadowLg: '0 8px 24px rgba(0,0,0,0.10)',
  r: '6px', rSm: '4px', rLg: '10px', rFull: '999px',
};

const THEME_B = {
  id: 'bold',
  label: 'Dev Dark',
  // Backgrounds
  bg: '#0D1117',
  surface: '#161B22',
  surface2: '#21262D',
  // Rail
  rail: '#010409',
  railBorder: '#21262D',
  railText: '#6E7681',
  railActive: 'rgba(56,139,253,0.12)',
  railActiveText: '#79C0FF',
  railActiveBorder: '#388BFD',
  // Borders & text
  border: '#30363D',
  borderSubtle: '#21262D',
  text: '#E6EDF3',
  text2: '#8B949E',
  text3: '#484F58',
  textOn: '#E6EDF3',
  // Accent
  accent: '#388BFD',
  accentHover: '#58A6FF',
  accentLight: 'rgba(56,139,253,0.12)',
  accentText: '#79C0FF',
  accentBorder: 'rgba(56,139,253,0.3)',
  // Semantic
  pass: '#3FB950',
  passLight: 'rgba(63,185,80,0.1)',
  passBorder: 'rgba(63,185,80,0.25)',
  fail: '#F85149',
  failLight: 'rgba(248,81,73,0.1)',
  failBorder: 'rgba(248,81,73,0.25)',
  warn: '#D29922',
  warnLight: 'rgba(210,153,34,0.1)',
  warnBorder: 'rgba(210,153,34,0.3)',
  blocked: '#BC8CFF',
  blockedLight: 'rgba(188,140,255,0.1)',
  blockedBorder: 'rgba(188,140,255,0.25)',
  skip: '#6E7681',
  skipLight: 'rgba(110,118,129,0.1)',
  skipBorder: 'rgba(110,118,129,0.25)',
  live: '#3FB950',
  liveGlow: 'rgba(63,185,80,0.4)',
  // Method pills
  get: { bg:'rgba(56,139,253,0.12)', text:'#79C0FF', border:'rgba(56,139,253,0.25)' },
  post: { bg:'rgba(63,185,80,0.1)', text:'#7EE787', border:'rgba(63,185,80,0.25)' },
  put: { bg:'rgba(210,153,34,0.1)', text:'#E3B341', border:'rgba(210,153,34,0.25)' },
  del: { bg:'rgba(248,81,73,0.1)', text:'#FF7B72', border:'rgba(248,81,73,0.25)' },
  patch: { bg:'rgba(188,140,255,0.1)', text:'#D2A8FF', border:'rgba(188,140,255,0.25)' },
  // Fonts
  font: '"IBM Plex Sans", system-ui, -apple-system, sans-serif',
  mono: '"IBM Plex Mono", "SF Mono", "Menlo", monospace',
  // Effects
  shadow: '0 1px 3px rgba(0,0,0,0.5)',
  shadowMd: '0 4px 12px rgba(0,0,0,0.5)',
  shadowLg: '0 8px 24px rgba(0,0,0,0.6)',
  r: '6px', rSm: '4px', rLg: '10px', rFull: '999px',
};

Object.assign(window, { THEME_A, THEME_B });
