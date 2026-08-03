// qa-icons.jsx — Minimal SVG icon set for QA Tools

const QAIcon = ({ name, size = 16, color = 'currentColor', style: s }) => {
  const p = { stroke: color, strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };
  const icons = {
    testCase: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" {...p}/>
      <line x1="5" y1="5" x2="11" y2="5" {...p}/>
      <line x1="5" y1="7.5" x2="11" y2="7.5" {...p}/>
      <line x1="5" y1="10" x2="8" y2="10" {...p}/>
    </svg>,
    testPlan: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" {...p}/>
      <line x1="1.5" y1="6.5" x2="14.5" y2="6.5" {...p}/>
      <line x1="6" y1="2.5" x2="6" y2="13.5" {...p}/>
    </svg>,
    runner: <svg width={size} height={size} viewBox="0 0 16 16" style={s}>
      <polygon points="3.5,2 13.5,8 3.5,14" fill={color}/>
    </svg>,
    logs: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" {...p}/>
      <polyline points="4.5,5.5 7,8 4.5,10.5" {...p}/>
      <line x1="9" y1="10.5" x2="12" y2="10.5" {...p}/>
    </svg>,
    device: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <rect x="4" y="1" width="8" height="14" rx="2" {...p}/>
      <circle cx="8" cy="12.5" r="0.75" fill={color} stroke="none"/>
      <line x1="6.5" y1="3" x2="9.5" y2="3" {...p}/>
    </svg>,
    settings: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <circle cx="8" cy="8" r="2.5" {...p}/>
      <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.1 3.1l1.06 1.06M11.84 11.84l1.06 1.06M3.1 12.9l1.06-1.06M11.84 4.16l1.06-1.06" {...p}/>
    </svg>,
    bug: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <path d="M8 13.5a4 4 0 100-8 4 4 0 000 8z" {...p}/>
      <path d="M5.5 4a2.5 2.5 0 015 0" {...p}/>
      <line x1="8" y1="5.5" x2="8" y2="9.5" {...p}/>
      <line x1="4" y1="8" x2="1.5" y2="8" {...p}/>
      <line x1="12" y1="8" x2="14.5" y2="8" {...p}/>
      <line x1="4" y1="11.5" x2="2" y2="13.5" {...p}/>
      <line x1="12" y1="11.5" x2="14" y2="13.5" {...p}/>
    </svg>,
    stop: <svg width={size} height={size} viewBox="0 0 16 16" style={s}>
      <rect x="3" y="3" width="10" height="10" rx="1.5" fill={color}/>
    </svg>,
    check: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <polyline points="2.5,8.5 6,12 13.5,4" {...p} strokeWidth={1.8}/>
    </svg>,
    x: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <line x1="3.5" y1="3.5" x2="12.5" y2="12.5" {...p} strokeWidth={1.8}/>
      <line x1="12.5" y1="3.5" x2="3.5" y2="12.5" {...p} strokeWidth={1.8}/>
    </svg>,
    skip: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <line x1="3" y1="8" x2="9" y2="8" {...p}/>
      <polyline points="7,5.5 10,8 7,10.5" {...p}/>
      <line x1="13" y1="4" x2="13" y2="12" {...p}/>
    </svg>,
    block: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <circle cx="8" cy="8" r="6" {...p}/>
      <line x1="3.76" y1="3.76" x2="12.24" y2="12.24" {...p}/>
    </svg>,
    plus: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <line x1="8" y1="3" x2="8" y2="13" {...p} strokeWidth={1.6}/>
      <line x1="3" y1="8" x2="13" y2="8" {...p} strokeWidth={1.6}/>
    </svg>,
    search: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <circle cx="6.5" cy="6.5" r="4.5" {...p}/>
      <line x1="9.5" y1="9.5" x2="14" y2="14" {...p} strokeWidth={1.6}/>
    </svg>,
    filter: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <line x1="2" y1="4" x2="14" y2="4" {...p}/>
      <line x1="4" y1="8" x2="12" y2="8" {...p}/>
      <line x1="6" y1="12" x2="10" y2="12" {...p}/>
    </svg>,
    chevronRight: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <polyline points="6,3 11,8 6,13" {...p} strokeWidth={1.6}/>
    </svg>,
    chevronDown: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <polyline points="3,6 8,11 13,6" {...p} strokeWidth={1.6}/>
    </svg>,
    wifi: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <path d="M1 5.5a9.5 9.5 0 0114 0" {...p}/>
      <path d="M3.5 8.5a5.5 5.5 0 019 0" {...p}/>
      <path d="M6 11.5a2.5 2.5 0 014 0" {...p}/>
      <circle cx="8" cy="14" r="1" fill={color} stroke="none"/>
    </svg>,
    timer: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <circle cx="8" cy="9" r="5.5" {...p}/>
      <path d="M8 6.5V9l2 1.5" {...p}/>
      <line x1="6.5" y1="1.5" x2="9.5" y2="1.5" {...p}/>
      <line x1="8" y1="1.5" x2="8" y2="3.5" {...p}/>
    </svg>,
    copy: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" {...p}/>
      <path d="M10.5 5.5V3a1.5 1.5 0 00-1.5-1.5H3A1.5 1.5 0 001.5 3v6A1.5 1.5 0 003 10.5h2.5" {...p}/>
    </svg>,
    tag: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <path d="M9 2H14.5V7.5L8 14a1.5 1.5 0 01-2.12 0L2 10.12A1.5 1.5 0 012 8L8.5 1.5H9z" {...p}/>
      <circle cx="11.5" cy="4.5" r="1" fill={color} stroke="none"/>
    </svg>,
    link: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <path d="M6.5 9.5a3.5 3.5 0 005 0l2-2a3.5 3.5 0 00-5-5L7 4" {...p}/>
      <path d="M9.5 6.5a3.5 3.5 0 00-5 0l-2 2a3.5 3.5 0 005 5L9 12" {...p}/>
    </svg>,
    refresh: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <path d="M13.5 8a5.5 5.5 0 11-1.1-3.3" {...p}/>
      <polyline points="14,2.5 12.5,5.5 9.5,4" {...p}/>
    </svg>,
    upload: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <polyline points="5,6 8,3 11,6" {...p}/>
      <line x1="8" y1="3" x2="8" y2="11" {...p}/>
      <path d="M2 13h12" {...p}/>
    </svg>,
    more: <svg width={size} height={size} viewBox="0 0 16 16" style={s}>
      <circle cx="4" cy="8" r="1.2" fill={color}/>
      <circle cx="8" cy="8" r="1.2" fill={color}/>
      <circle cx="12" cy="8" r="1.2" fill={color}/>
    </svg>,
    layers: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <polyline points="1,5 8,2 15,5" {...p}/>
      <polyline points="1,8.5 8,5.5 15,8.5" {...p}/>
      <polyline points="1,12 8,9 15,12" {...p}/>
    </svg>,
    workspace: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <rect x="1.5" y="1.5" width="13" height="10" rx="2" {...p}/>
      <line x1="5" y1="14.5" x2="11" y2="14.5" {...p}/>
      <line x1="8" y1="11.5" x2="8" y2="14.5" {...p}/>
    </svg>,
    arrowLeft: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <line x1="13" y1="8" x2="3" y2="8" {...p} strokeWidth={1.6}/>
      <polyline points="6.5,4.5 3,8 6.5,11.5" {...p} strokeWidth={1.6}/>
    </svg>,
    info: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <circle cx="8" cy="8" r="6.5" {...p}/>
      <line x1="8" y1="7.5" x2="8" y2="11" {...p}/>
      <circle cx="8" cy="5.5" r="0.75" fill={color} stroke="none"/>
    </svg>,
    trash: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <line x1="2.5" y1="4" x2="13.5" y2="4" {...p}/>
      <path d="M4 4l.7 9a1.5 1.5 0 001.5 1.4h3.6A1.5 1.5 0 0011.3 13l.7-9" {...p}/>
      <path d="M6 4V2.7A1.2 1.2 0 017.2 1.5h1.6A1.2 1.2 0 0110 2.7V4" {...p}/>
      <line x1="6.5" y1="6.5" x2="6.7" y2="12" {...p}/>
      <line x1="9.5" y1="6.5" x2="9.3" y2="12" {...p}/>
    </svg>,
    edit: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <path d="M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z" {...p}/>
      <line x1="10" y1="4" x2="12" y2="6" {...p}/>
    </svg>,
    history: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <path d="M2.5 8a5.5 5.5 0 105.5-5.5A5.5 5.5 0 003 5.5" {...p}/>
      <polyline points="2,2.5 3,5.5 6,4.8" {...p}/>
      <polyline points="8,5.5 8,8 10,9.5" {...p}/>
    </svg>,
    user: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <circle cx="8" cy="5.5" r="2.75" {...p}/>
      <path d="M3 13.5a5 5 0 0110 0" {...p}/>
    </svg>,
    warning: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <path d="M8 2L14.5 13.5H1.5L8 2z" {...p}/>
      <line x1="8" y1="6.5" x2="8" y2="9.5" {...p}/>
      <circle cx="8" cy="11.5" r="0.75" fill={color} stroke="none"/>
    </svg>,
    fork: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <circle cx="4" cy="3.5" r="1.8" {...p}/>
      <circle cx="4" cy="12.5" r="1.8" {...p}/>
      <circle cx="12" cy="3.5" r="1.8" {...p}/>
      <path d="M4 5.3v5.4" {...p}/>
      <path d="M12 5.3v1.2a3 3 0 01-3 3H4" {...p}/>
    </svg>,
    sort: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <path d="M5 2.5v11" {...p}/>
      <polyline points="2.5,5 5,2.5 7.5,5" {...p}/>
      <path d="M11 13.5v-11" {...p}/>
      <polyline points="8.5,11 11,13.5 13.5,11" {...p}/>
    </svg>,
    play: <svg width={size} height={size} viewBox="0 0 16 16" style={s}>
      <polygon points="4,2.5 13,8 4,13.5" fill={color}/>
    </svg>,
    apple: <svg width={size} height={size} viewBox="0 0 16 16" style={s}>
      <path d="M11 8.4c0-1.5 1.2-2.2 1.3-2.3-.7-1-1.8-1.2-2.2-1.2-.9-.1-1.8.6-2.3.6s-1.2-.5-2-.5c-1 0-2 .6-2.5 1.5-1.1 1.9-.3 4.6.8 6.1.5.7 1.1 1.5 1.9 1.5.8 0 1-.5 1.9-.5s1.1.5 1.9.5 1.3-.7 1.8-1.4c.4-.6.6-1.2.7-1.3-.1 0-1.3-.5-1.3-1.5z" fill={color}/>
      <path d="M9.6 3.9c.4-.5.7-1.2.6-1.9-.6 0-1.3.4-1.7.9-.4.4-.7 1.1-.6 1.8.7 0 1.3-.3 1.7-.8z" fill={color}/>
    </svg>,
    android: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <path d="M3 7.5a5 5 0 0110 0" {...p}/>
      <rect x="3" y="7.5" width="10" height="5.5" rx="1" {...p}/>
      <line x1="1.5" y1="8.5" x2="1.5" y2="11" {...p}/>
      <line x1="14.5" y1="8.5" x2="14.5" y2="11" {...p}/>
      <line x1="4.8" y1="4" x2="4" y2="3" {...p}/>
      <line x1="11.2" y1="4" x2="12" y2="3" {...p}/>
      <circle cx="6" cy="6" r="0.5" fill={color} stroke="none"/>
      <circle cx="10" cy="6" r="0.5" fill={color} stroke="none"/>
    </svg>,
    linkBreak: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <path d="M6.2 9.8l-1.4 1.4a2.5 2.5 0 01-3.5-3.5L2.7 6.3" {...p}/>
      <path d="M9.8 6.2l1.4-1.4a2.5 2.5 0 013.5 3.5l-1.4 1.4" {...p}/>
      <line x1="8" y1="1.5" x2="8" y2="3.2" {...p}/>
      <line x1="1.5" y1="8" x2="3.2" y2="8" {...p}/>
      <line x1="14.5" y1="8" x2="12.8" y2="8" {...p}/>
    </svg>,
    image: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" {...p}/>
      <circle cx="5.5" cy="6" r="1.2" {...p}/>
      <polyline points="2.5,12 6,8.5 8.5,11 11,8 13.5,10.5" {...p}/>
    </svg>,
    plug: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <path d="M5 9l2 2 4-4" {...p}/>
      <path d="M8 1.5v3M4.5 5h7l-.5 3.5a3 3 0 01-3 2.6h0a3 3 0 01-3-2.6L4.5 5z" {...p}/>
      <line x1="8" y1="11.6" x2="8" y2="14.5" {...p}/>
    </svg>,
    planRemove: <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" {...p}/>
      <line x1="2" y1="6" x2="14" y2="6" {...p}/>
      <line x1="5.5" y1="8.5" x2="10.5" y2="12" {...p} strokeWidth={1.6}/>
      <line x1="10.5" y1="8.5" x2="5.5" y2="12" {...p} strokeWidth={1.6}/>
    </svg>,
  };
  return icons[name] || <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={s}>
    <rect x="2" y="2" width="12" height="12" rx="2" stroke={color} strokeWidth={1.4} fill="none"/>
  </svg>;
};

Object.assign(window, { QAIcon });
