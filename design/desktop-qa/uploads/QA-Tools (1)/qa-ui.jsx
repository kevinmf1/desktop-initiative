// qa-ui.jsx — Shared UI shell components for QA Tools

const NAV_ITEMS = [
  { id: 'cases',   icon: 'testCase', label: 'Test Cases' },
  { id: 'plans',   icon: 'testPlan', label: 'Test Plans' },
  { id: 'runner',  icon: 'runner',   label: 'Runner' },
  { id: 'logs',    icon: 'logs',     label: 'Log Inspector' },
];

// Devices connected to this workspace (shown in the global bottom dock)
const CONNECTED_DEVICES = [
  { platform:'iOS',     name:"Marco's iPhone 14 Pro", os:'iOS 17.4 · iPhone14,3', id:'DEVICE-A3B2', battery:82,  session:'Regression Suite v2.4' },
  { platform:'Android', name:'Pixel 8 · Emulator',     os:'Android 14 · API 34',  id:'DEVICE-C7F1', battery:100, session:'Regression Suite v2.4' },
];

// Stylised QR (mock) — finder patterns + pseudo-random modules
const QrCode = ({ size = 108 }) => {
  const n = 21, pad = 2, cell = size / (n + pad * 2), mods = [];
  const ring = (r, c, br, bc) => { const rr = r-br, cc = c-bc; if (rr<0||rr>6||cc<0||cc>6) return null; const edge = rr===0||rr===6||cc===0||cc===6; const center = rr>=2&&rr<=4&&cc>=2&&cc<=4; return edge||center; };
  for (let r=0;r<n;r++) for (let c=0;c<n;c++) {
    const f = ring(r,c,0,0) ?? ring(r,c,0,n-7) ?? ring(r,c,n-7,0);
    const on = f !== null ? f : ((r*3 + c*7 + r*c) % 5 === 0);
    if (on) mods.push([r,c]);
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ background:'#fff', borderRadius:8, display:'block' }}>
      {mods.map(([r,c],i) => <rect key={i} x={(c+pad)*cell} y={(r+pad)*cell} width={cell+0.4} height={cell+0.4} fill="#111827"/>)}
    </svg>
  );
};

const DeviceChipMini = ({ t, d }) => (
  <div style={{ display:'flex', alignItems:'center', gap:7, padding:'4px 10px 4px 8px', borderRadius:t.rFull, background: t.id==='bold'?t.surface2:t.bg, border:`1px solid ${t.border}` }}>
    <QAIcon name={d.platform==='Android'?'android':'apple'} size={13} color={t.text2}/>
    <span style={{ fontSize:12, color:t.text, fontWeight:500, whiteSpace:'nowrap' }}>{d.name}</span>
    <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:t.live, boxShadow:`0 0 0 2px ${t.liveGlow}` }}/>
      <span style={{ fontSize:10.5, fontWeight:600, color:t.live }}>Live</span>
    </span>
  </div>
);

const DeviceDock = ({ t, defaultOpen }) => {
  const [open, setOpen] = React.useState(!!defaultOpen);
  const codeBg = t.id==='bold' ? '#010409' : '#0D1117';
  return (
    <div style={{ flexShrink:0, borderTop:`1px solid ${t.border}`, background:t.surface }}>
      {/* Expanded “how to connect” panel */}
      {open && (
        <div style={{ display:'flex', borderBottom:`1px solid ${t.border}` }}>
          {/* Left: pair a new device */}
          <div style={{ width:520, padding:'16px 20px', borderRight:`1px solid ${t.border}`, display:'flex', gap:18 }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
              <div style={{ padding:8, borderRadius:t.r, background:'#fff', border:`1px solid ${t.border}` }}><QrCode size={104}/></div>
              <span style={{ fontSize:10.5, color:t.text3, fontFamily:t.mono }}>Scan with the QA app</span>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <span style={{ fontSize:10, fontWeight:700, color:t.text3, textTransform:'uppercase', letterSpacing:0.6, fontFamily:t.mono }}>How to connect</span>
              <div style={{ display:'flex', flexDirection:'column', gap:7, margin:'8px 0 10px' }}>
                {['Install the QA SDK in your app build','Run the command below, or scan the QR','Device appears here automatically'].map((s,i)=>(
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ width:17, height:17, borderRadius:'50%', background:t.accentLight, border:`1px solid ${t.accentBorder}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:t.accentText, fontFamily:t.mono, flexShrink:0 }}>{i+1}</span>
                    <span style={{ fontSize:12.5, color:t.text2 }}>{s}</span>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:t.rSm, background:codeBg, fontFamily:t.mono, fontSize:11.5 }}>
                <span style={{ color:'#7EE787' }}>$</span>
                <span style={{ color:'#E6EDF3', flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>qa-sdk connect --token qa_live_8f2a3c1e</span>
                <div style={{ display:'flex', alignItems:'center', gap:4, padding:'2px 7px', borderRadius:t.rSm, background:'rgba(255,255,255,0.08)', cursor:'pointer' }}><QAIcon name="copy" size={11} color="#8B949E"/><span style={{ fontSize:11, color:'#8B949E', fontWeight:600 }}>Copy</span></div>
              </div>
            </div>
          </div>
          {/* Right: connected device detail */}
          <div style={{ flex:1, padding:'16px 20px' }}>
            <span style={{ fontSize:10, fontWeight:700, color:t.text3, textTransform:'uppercase', letterSpacing:0.6, fontFamily:t.mono }}>Connected devices · {CONNECTED_DEVICES.length}</span>
            <div style={{ display:'flex', gap:12, marginTop:10 }}>
              {CONNECTED_DEVICES.map(d => (
                <div key={d.id} style={{ flex:1, minWidth:0, padding:'11px 13px', borderRadius:t.r, background: t.id==='bold'?t.surface2:t.bg, border:`1px solid ${t.border}` }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                    <QAIcon name={d.platform==='Android'?'android':'apple'} size={16} color={t.text}/>
                    <span style={{ fontSize:13, fontWeight:600, color:t.text, flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{d.name}</span>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}><span style={{ width:6, height:6, borderRadius:'50%', background:t.live, boxShadow:`0 0 0 2px ${t.liveGlow}` }}/><span style={{ fontSize:10.5, fontWeight:600, color:t.live }}>Live</span></span>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ fontSize:11, color:t.text3 }}>OS</span><span style={{ fontSize:11, color:t.text2, fontFamily:t.mono }}>{d.os}</span></div>
                    <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ fontSize:11, color:t.text3 }}>Device ID</span><span style={{ fontSize:11, color:t.text2, fontFamily:t.mono }}>{d.id}</span></div>
                    <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ fontSize:11, color:t.text3 }}>Session</span><span style={{ fontSize:11, color:t.text2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:130 }}>{d.session}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Collapsed bar (always visible, sticky bottom) */}
      <div style={{ height:46, display:'flex', alignItems:'center', gap:12, padding:'0 16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:t.live, boxShadow:`0 0 0 3px ${t.liveGlow}` }}/>
          <span style={{ fontSize:12.5, fontWeight:600, color:t.text }}>{CONNECTED_DEVICES.length} devices connected</span>
        </div>
        <Divider t={t} vertical length={20}/>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {CONNECTED_DEVICES.map(d => <DeviceChipMini key={d.id} t={t} d={d}/>)}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
          <Btn t={t} variant="ghost" icon="plus" compact>Add device</Btn>
          <div onClick={()=>setOpen(!open)} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:t.r, background: open?t.accentLight:'transparent', border:`1px solid ${open?t.accentBorder:t.border}`, cursor:'pointer' }}>
            <QAIcon name="plug" size={13} color={open?t.accentText:t.text2}/>
            <span style={{ fontSize:12.5, fontWeight:600, color:open?t.accentText:t.text }}>How to connect</span>
            <div style={{ transform: open?'rotate(180deg)':'none', transition:'transform .15s', display:'flex' }}><QAIcon name="chevronDown" size={11} color={open?t.accentText:t.text3}/></div>
          </div>
        </div>
      </div>
    </div>
  );
};

const NavRail = ({ t, active }) => {
  const railStyles = {
    wrap: { width: 60, minWidth: 60, height: '100%', background: t.rail, borderRight: `1px solid ${t.railBorder}`, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12, paddingBottom: 12 },
    logo: { width: 34, height: 34, borderRadius: t.r, background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, flexShrink: 0 },
    logoText: { color: '#fff', fontFamily: t.mono, fontSize: 13, fontWeight: 700, letterSpacing: -0.5 },
    divider: { width: 28, height: 1, background: t.railBorder, margin: '8px 0' },
    navList: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1, width: '100%', paddingLeft: 6, paddingRight: 6 },
    item: (isActive) => ({ width: '100%', height: 44, borderRadius: t.rSm, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: isActive ? t.railActive : 'transparent', borderLeft: `2px solid ${isActive ? t.railActiveBorder : 'transparent'}`, transition: 'all 0.15s', position: 'relative' }),
    settingsWrap: { marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
    avatar: { width: 28, height: 28, borderRadius: '50%', background: '#2D3D5A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B9BB8', fontFamily: t.font, fontSize: 11, fontWeight: 600 },
  };
  return (
    <div style={railStyles.wrap}>
      <div style={railStyles.logo}><span style={railStyles.logoText}>QA</span></div>
      <div style={railStyles.divider}/>
      <div style={railStyles.navList}>
        {NAV_ITEMS.map(item => (
          <div key={item.id} style={railStyles.item(active === item.id)} title={item.label}>
            <QAIcon name={item.icon} size={18} color={active === item.id ? t.railActiveText : t.railText}/>
          </div>
        ))}
      </div>
      <div style={railStyles.settingsWrap}>
        <div style={railStyles.item(false)} title="Settings">
          <QAIcon name="settings" size={18} color={t.railText}/>
        </div>
        <div style={railStyles.avatar}>M</div>
      </div>
    </div>
  );
};

const AppShell = ({ t, active, children, dockOpen }) => (
  <div style={{ display: 'flex', width: 1440, height: 900, fontFamily: t.font, background: t.bg, overflow: 'hidden' }}>
    <NavRail t={t} active={active}/>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {children}
      </div>
      <DeviceDock t={t} defaultOpen={dockOpen}/>
    </div>
  </div>
);

const PageHeader = ({ t, title, subtitle, actions, tabs, activeTab }) => (
  <div style={{ background: t.surface, borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
    <div style={{ padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: t.text, lineHeight: 1.2 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: t.text2, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
    {tabs && (
      <div style={{ display: 'flex', gap: 0, paddingLeft: 24, borderTop: `1px solid ${t.border}` }}>
        {tabs.map(tab => (
          <div key={tab} style={{ padding: '0 16px', height: 36, display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: activeTab === tab ? 600 : 400, color: activeTab === tab ? t.accent : t.text2, borderBottom: `2px solid ${activeTab === tab ? t.accent : 'transparent'}`, cursor: 'pointer' }}>
            {tab}
          </div>
        ))}
      </div>
    )}
  </div>
);

const Btn = ({ t, variant = 'primary', children, icon, compact }) => {
  const variants = {
    primary: { bg: t.accent, color: '#fff', border: 'transparent', fontWeight: 600 },
    secondary: { bg: t.surface, color: t.text, border: t.border, fontWeight: 500 },
    ghost: { bg: 'transparent', color: t.text2, border: 'transparent', fontWeight: 500 },
    danger: { bg: t.failLight, color: t.fail, border: t.failBorder, fontWeight: 600 },
    warn: { bg: t.warnLight, color: t.warn, border: t.warnBorder, fontWeight: 600 },
    success: { bg: t.passLight, color: t.pass, border: t.passBorder, fontWeight: 600 },
  };
  const v = variants[variant] || variants.primary;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: compact ? '4px 10px' : '7px 14px', borderRadius: t.r, background: v.bg, color: v.color, border: `1px solid ${v.border}`, fontSize: compact ? 12 : 13, fontWeight: v.fontWeight, cursor: 'pointer', fontFamily: t.font, whiteSpace: 'nowrap', userSelect: 'none' }}>
      {icon && <QAIcon name={icon} size={13} color={v.color}/>}
      {children}
    </div>
  );
};

const Badge = ({ t, variant = 'default', children, dot, sm }) => {
  const variants = {
    pass:    { bg: t.passLight,    color: t.pass,    border: t.passBorder },
    fail:    { bg: t.failLight,    color: t.fail,    border: t.failBorder },
    warn:    { bg: t.warnLight,    color: t.warn,    border: t.warnBorder },
    blocked: { bg: t.blockedLight, color: t.blocked, border: t.blockedBorder },
    skip:    { bg: t.skipLight,    color: t.skip,    border: t.skipBorder },
    accent:  { bg: t.accentLight,  color: t.accentText, border: t.accentBorder },
    active:  { bg: t.accentLight,  color: t.accentText, border: t.accentBorder },
    default: { bg: t.surface2,     color: t.text2,   border: t.border },
  };
  const v = variants[variant] || variants.default;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: sm ? '2px 7px' : '3px 9px', borderRadius: t.rFull, background: v.bg, color: v.color, border: `1px solid ${v.border}`, fontSize: sm ? 10 : 11, fontWeight: 600, fontFamily: t.font, whiteSpace: 'nowrap', lineHeight: 1.5 }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: v.color, flexShrink: 0 }}/>}
      {children}
    </div>
  );
};

const MethodPill = ({ t, method }) => {
  const m = (method || 'GET').toUpperCase();
  const styles = { GET: t.get, POST: t.post, PUT: t.put, DELETE: t.del, DEL: t.del, PATCH: t.patch };
  const s = styles[m] || t.get;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 20, borderRadius: t.rSm, background: s.bg, color: s.text, border: `1px solid ${s.border}`, fontSize: 10, fontWeight: 700, fontFamily: t.mono, flexShrink: 0, letterSpacing: 0.3 }}>
      {m === 'DELETE' ? 'DEL' : m}
    </div>
  );
};

const LiveDot = ({ t, active = true }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? t.live : t.text3, boxShadow: active ? `0 0 0 3px ${t.liveGlow}` : 'none', flexShrink: 0 }}/>
    <span style={{ fontSize: 12, fontWeight: 600, color: active ? t.live : t.text3, fontFamily: t.font }}>{active ? 'Live' : 'Disconnected'}</span>
  </div>
);

const StatusCode = ({ t, code }) => {
  const n = parseInt(code);
  const color = n >= 500 ? t.fail : n >= 400 ? t.warn : n >= 300 ? t.skip : t.pass;
  const bg = n >= 500 ? t.failLight : n >= 400 ? t.warnLight : n >= 300 ? t.skipLight : t.passLight;
  const border = n >= 500 ? t.failBorder : n >= 400 ? t.warnBorder : n >= 300 ? t.skipBorder : t.passBorder;
  return <div style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: t.rSm, background: bg, color, border: `1px solid ${border}`, fontSize: 11, fontWeight: 700, fontFamily: t.mono, flexShrink: 0 }}>{code}</div>;
};

const SearchField = ({ t, placeholder = 'Search…', width = 220 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, width, height: 32, padding: '0 10px', background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.r }}>
    <QAIcon name="search" size={13} color={t.text3}/>
    <span style={{ fontSize: 13, color: t.text3, fontFamily: t.font }}>{placeholder}</span>
  </div>
);

const Divider = ({ t, vertical, length }) => (
  <div style={vertical
    ? { width: 1, height: length || '100%', background: t.border, flexShrink: 0 }
    : { height: 1, width: length || '100%', background: t.border, flexShrink: 0 }
  }/>
);

const Chip = ({ t, children, active, icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: t.rFull, background: active ? t.accentLight : t.surface2, color: active ? t.accentText : t.text2, border: `1px solid ${active ? t.accentBorder : t.border}`, fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: t.font, whiteSpace: 'nowrap' }}>
    {icon && <QAIcon name={icon} size={12} color={active ? t.accentText : t.text3}/>}
    {children}
  </div>
);

Object.assign(window, { AppShell, NavRail, PageHeader, Btn, Badge, MethodPill, LiveDot, StatusCode, SearchField, Divider, Chip, NAV_ITEMS, DeviceDock, QrCode, CONNECTED_DEVICES });
