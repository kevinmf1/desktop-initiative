// qa-log-inspector.jsx — Live Log Inspector screen

// Requests carry the device + session that produced them, so we can track
// when the tester switched devices mid-run.
const LOG_DATA = [
  { id:1,  method:'GET',  path:'/api/v1/products/P-84921/image.png',    status:200, ms:64,   ts:'04:24:12', device:'iOS',     session:'TC-004', kind:'image' },
  { id:2,  method:'POST', path:'/api/v1/auth/login',                    status:200, ms:342,  ts:'04:23:01', device:'iOS',     session:'TC-001' },
  { id:3,  method:'GET',  path:'/api/v1/users/me',                       status:200, ms:88,   ts:'04:23:01', device:'iOS',     session:'TC-001' },
  { id:4,  method:'POST', path:'/api/v1/auth/forgot-password',           status:200, ms:203,  ts:'04:23:14', device:'iOS',     session:'TC-003' },
  { id:5,  method:'GET',  path:'/api/v1/auth/reset-token/validate',      status:200, ms:67,   ts:'04:23:19', device:'iOS',     session:'TC-003' },
  { id:6,  method:'POST', path:'/api/v1/auth/reset-password',            status:422, ms:145,  ts:'04:23:31', device:'iOS',     session:'TC-003' },
  { id:7,  method:'GET',  path:'/api/v1/products?q=shoes&limit=20',      status:200, ms:312,  ts:'04:24:05', device:'Android', session:'TC-004' },
  { id:8,  method:'POST', path:'/api/v1/cart/items',                     status:201, ms:187,  ts:'04:25:02', device:'Android', session:'TC-005' },
  { id:9,  method:'POST', path:'/api/v1/checkout/session',               status:200, ms:243,  ts:'04:26:14', device:'Android', session:'TC-006' },
  { id:10, method:'POST', path:'/api/v1/orders',                         status:500, ms:1203, ts:'04:26:44', device:'Android', session:'TC-006' },
];

// Session timeline — grouped by device so a device switch is explicit.
const SESSION_GROUPS = [
  { device:'iOS', name:"Marco's iPhone 14 Pro", model:'iPhone14,3', from:'04:23:01',
    sessions:[
      { code:'TC-001', label:'Login valid',    time:'04:23:01', status:'pass', reqs:2 },
      { code:'TC-003', label:'Password reset', time:'04:23:14', status:'fail', reqs:3, active:true },
    ]},
  { device:'Android', name:'Pixel 8 · Emulator', model:'Pixel 8 / API 34', from:'04:24:05',
    sessions:[
      { code:'TC-004', label:'Product search', time:'04:24:05', status:'pass', reqs:2 },
      { code:'TC-005', label:'Add to cart',    time:'04:25:02', status:'pass', reqs:1 },
      { code:'TC-006', label:'Checkout',       time:'04:26:14', status:'fail', reqs:2 },
    ]},
];

const reqHeaders = [
  { key:'Content-Type', val:'application/json' },
  { key:'Authorization', val:'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…' },
  { key:'X-Device-ID', val:'DEVICE-A3B2C1D4' },
  { key:'X-Request-ID', val:'req_8f2a3c1e' },
];
const resHeaders = [
  { key:'Content-Type', val:'application/json; charset=utf-8' },
  { key:'X-Request-ID', val:'req_8f2a3c1e' },
  { key:'X-Rate-Limit-Remaining', val:'47' },
];

// Response/request bodies as real objects → foldable tree
const RES_BODY = {
  error: 'validation_failed',
  message: 'Token has expired or is invalid.',
  code: 'RESET_TOKEN_EXPIRED',
  retryable: false,
  details: { field: 'token', reason: 'expired', expiredAt: '2026-06-08T04:10:00Z' },
  timestamp: '2026-06-08T04:23:31Z',
};
const REQ_BODY = {
  token: 'a8f2c1e7-4b3d-4a92-9c01-f2e3a4b5c6d7',
  password: '[REDACTED]',
  confirmPassword: '[REDACTED]',
};

// ── Foldable JSON tree ────────────────────────────────────────────────────────
const jsonColors = (t) => ({
  string:  t.id==='bold' ? '#A5D6A7' : '#166534',
  number:  t.id==='bold' ? '#79C0FF' : '#1E40AF',
  boolean: t.id==='bold' ? '#FF7B72' : '#9D174D',
  null:    t.id==='bold' ? '#8B949E' : '#6B7280',
  key:     t.id==='bold' ? '#D2A8FF' : '#7C3AED',
  punct:   t.text3,
});

const JsonNode = ({ t, k, value, depth, last }) => {
  const [open, setOpen] = React.useState(depth < 2);
  const c = jsonColors(t);
  const isObj = value !== null && typeof value === 'object';
  const keyEl = k != null ? <><span style={{ color:c.key }}>"{k}"</span><span style={{ color:c.punct }}>: </span></> : null;
  if (!isObj) {
    const type = value === null ? 'null' : typeof value;
    const str = type === 'string' ? `"${value}"` : String(value);
    return (
      <div style={{ paddingLeft: depth*16 + 14 }}>
        {keyEl}<span style={{ color: c[type] || t.text }}>{str}</span>{!last && <span style={{ color:c.punct }}>,</span>}
      </div>
    );
  }
  const arr = Array.isArray(value);
  const entries = arr ? value.map((v,i)=>[i,v]) : Object.entries(value);
  const openB = arr ? '[' : '{';
  const closeB = arr ? ']' : '}';
  return (
    <div>
      <div style={{ paddingLeft: depth*16, cursor:'pointer', display:'flex', alignItems:'flex-start' }} onClick={()=>setOpen(!open)}>
        <span style={{ width:14, flexShrink:0, color:t.text3, display:'inline-flex', alignItems:'center', height:20, transform: open?'rotate(90deg)':'none', transition:'transform .12s' }}><QAIcon name="chevronRight" size={9} color={t.text3}/></span>
        <span>{keyEl}<span style={{ color:c.punct }}>{openB}</span>
          {!open && <span style={{ color:t.text3 }}> … {entries.length} {arr?'items':'keys'} <span style={{ color:c.punct }}>{closeB}</span>{!last?',':''}</span>}
        </span>
      </div>
      {open && entries.map(([ck,cv],i)=>(
        <JsonNode key={ck} t={t} k={arr?null:ck} value={cv} depth={depth+1} last={i===entries.length-1}/>
      ))}
      {open && <div style={{ paddingLeft: depth*16 + 14, color:c.punct }}>{closeB}{!last?',':''}</div>}
    </div>
  );
};

// Toolbar shared by Request/Response bodies: search + copy + collapse
const BodyToolbar = ({ t, label }) => (
  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderBottom:`1px solid ${t.border}`, background: t.id==='bold'?t.surface2:t.surface }}>
    <span style={{ fontSize:11, fontWeight:700, color:t.text3, textTransform:'uppercase', letterSpacing:0.6, fontFamily:t.mono }}>{label}</span>
    <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, width:150, height:26, padding:'0 8px', borderRadius:t.rSm, background:t.surface, border:`1px solid ${t.border}` }}>
        <QAIcon name="search" size={11} color={t.text3}/>
        <span style={{ fontSize:11.5, color:t.text3 }}>Search JSON…</span>
      </div>
      <div title="Collapse all" style={{ width:26, height:26, borderRadius:t.rSm, border:`1px solid ${t.border}`, background:t.surface, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}><QAIcon name="chevronDown" size={12} color={t.text3}/></div>
      <div title="Copy JSON" style={{ display:'flex', alignItems:'center', gap:5, height:26, padding:'0 9px', borderRadius:t.rSm, border:`1px solid ${t.border}`, background:t.surface, cursor:'pointer' }}>
        <QAIcon name="copy" size={12} color={t.text2}/><span style={{ fontSize:11.5, fontWeight:600, color:t.text2 }}>Copy</span>
      </div>
    </div>
  </div>
);

// Rendered image response (data-URI placeholder — a real product image would load here)
const IMG_URI = "data:image/svg+xml;utf8," + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%23e2e8f0'/><stop offset='1' stop-color='%23cbd5e1'/></linearGradient></defs><rect width='240' height='240' fill='url(%23g)'/><rect x='54' y='96' width='132' height='70' rx='10' fill='%23fff'/><path d='M78 150l22-26 16 18 14-16 22 24z' fill='%2394a3b8'/><circle cx='150' cy='120' r='9' fill='%2394a3b8'/><rect x='72' y='176' width='96' height='8' rx='4' fill='%23ffffff'/></svg>"
);

const StatMeta = ({ t, entry }) => (
  <div style={{ display:'flex', gap:16 }}>
    {[
      { label:'Timestamp', val:`${entry.ts} UTC` },
      { label:'Device', val:entry.device==='Android'?'Pixel 8':"Marco's iPhone", icon:entry.device==='Android'?'android':'apple' },
      { label:'Session', val:entry.session, mono:true },
      { label:'Request ID', val:'req_8f2a3c1e', mono:true },
    ].map(m => (
      <div key={m.label} style={{ display:'flex', flexDirection:'column', gap:1 }}>
        <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:0.6, color:t.text3, fontFamily:t.mono }}>{m.label}</span>
        <span style={{ fontSize:12, color:t.text, fontFamily: m.mono ? t.mono : t.font, display:'inline-flex', alignItems:'center', gap:4 }}>{m.icon && <QAIcon name={m.icon} size={11} color={t.text3}/>}{m.val}</span>
      </div>
    ))}
  </div>
);

// ── Empty state: no device connected ──────────────────────────────────────────
const LogEmptyState = ({ t }) => (
  <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, background:t.bg, padding:24 }}>
    <div style={{ width:68, height:68, borderRadius:'50%', background: t.id==='bold'?t.surface2:t.surface, border:`1px solid ${t.border}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <QAIcon name="plug" size={30} color={t.text3}/>
    </div>
    <div style={{ textAlign:'center' }}>
      <div style={{ fontSize:16, fontWeight:600, color:t.text, marginBottom:5 }}>No device connected</div>
      <div style={{ fontSize:13, color:t.text2, maxWidth:380, lineHeight:1.6 }}>Connect a device running the QA SDK to stream live network traffic. Requests appear here as your app makes them.</div>
    </div>
    <div style={{ display:'flex', flexDirection:'column', gap:8, alignItems:'center', marginTop:2 }}>
      <div style={{ display:'flex', gap:8 }}>
        <Btn t={t} variant="primary" icon="plug">Connect Device</Btn>
        <Btn t={t} variant="secondary" icon="refresh">Scan Network</Btn>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, padding:'10px 14px', borderRadius:t.r, background: t.id==='bold'?t.surface2:t.surface, border:`1px dashed ${t.border}`, fontFamily:t.mono, fontSize:12, color:t.text2 }}>
        <span style={{ color:t.text3 }}>$</span> qa-sdk connect --workspace acme-commerce
      </div>
    </div>
  </div>
);

const LogInspectorScreen = ({ t, noDevice }) => {
  const [activeTab, setActiveTab] = React.useState('Response');
  const [selId, setSelId] = React.useState(6); // reset-password 422
  const selected = LOG_DATA.find(e => e.id === selId) || LOG_DATA[0];
  const isImage = selected.kind === 'image';
  const currentDevice = SESSION_GROUPS.find(g => g.device === selected.device) || SESSION_GROUPS[0];

  const logStyles = {
    deviceBar: { height:44, background:t.surface, borderBottom:`1px solid ${t.border}`, display:'flex', alignItems:'center', gap:12, padding:'0 16px', flexShrink:0 },
    filterBar: { height:44, background: t.id==='bold' ? t.surface2 : t.bg, borderBottom:`1px solid ${t.border}`, display:'flex', alignItems:'center', gap:8, padding:'0 12px', flexShrink:0 },
    body: { flex:1, display:'flex', overflow:'hidden' },
    sessionRail: { width:212, borderRight:`1px solid ${t.border}`, display:'flex', flexDirection:'column', overflow:'hidden', flexShrink:0, background:t.surface },
    requestList: { width:376, borderRight:`1px solid ${t.border}`, display:'flex', flexDirection:'column', overflow:'hidden', flexShrink:0 },
    listHeader: { height:36, display:'flex', alignItems:'center', padding:'0 12px', background: t.id==='bold' ? t.surface2 : t.surface, borderBottom:`1px solid ${t.border}`, flexShrink:0 },
    listBody: { flex:1, overflowY:'auto', background:t.bg },
    detailPanel: { flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:t.surface },
    detailHeader: { padding:'12px 16px', borderBottom:`1px solid ${t.border}`, background:t.surface, flexShrink:0 },
    tabBar: { display:'flex', borderBottom:`1px solid ${t.border}`, background:t.surface, flexShrink:0 },
    tabContent: { flex:1, overflowY:'auto', padding:'0', background: t.id==='bold' ? t.bg : '#FAFBFC' },
    headerRow: { display:'flex', borderBottom:`1px solid ${t.borderSubtle}`, padding:'7px 16px', gap:16, alignItems:'center' },
    headerKey: { width:190, fontSize:12, color:t.text2, fontFamily:t.mono, fontWeight:600, flexShrink:0 },
    headerVal: { flex:1, fontSize:12, color:t.text, fontFamily:t.mono, wordBreak:'break-all' },
  };

  const LogListRow = ({ entry }) => {
    const sel = entry.id === selId;
    return (
      <div onClick={()=>setSelId(entry.id)} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background: sel ? t.accentLight : entry.status>=500 ? t.failLight : 'transparent', borderBottom:`1px solid ${t.borderSubtle}`, cursor:'pointer', borderLeft:`3px solid ${sel ? t.accent : entry.status>=500 ? t.fail : 'transparent'}` }}>
        <QAIcon name={entry.device==='Android'?'android':'apple'} size={12} color={t.text3}/>
        <MethodPill t={t} method={entry.method}/>
        <div style={{ flex:1, display:'flex', alignItems:'center', gap:5, minWidth:0 }}>
          {entry.kind==='image' && <QAIcon name="image" size={12} color={t.accent}/>}
          <span style={{ fontSize:12, color:t.text, fontFamily:t.mono, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{entry.path}</span>
        </div>
        <StatusCode t={t} code={entry.status}/>
        <div style={{ fontSize:11, color:t.text3, fontFamily:t.mono, width:44, textAlign:'right', flexShrink:0 }}>{entry.ms}ms</div>
      </div>
    );
  };

  const tabs = ['Overview','Request','Response'];

  return (
    <AppShell t={t} active="logs">
      {/* Device / session bar */}
      <div style={logStyles.deviceBar}>
        <LiveDot t={t} active={!noDevice}/>
        <Divider t={t} vertical length={20}/>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <QAIcon name={noDevice ? 'device' : (currentDevice.device==='Android'?'android':'apple')} size={13} color={t.text3}/>
          <span style={{ fontSize:12, color:t.text2, fontFamily:t.font }}>{noDevice ? 'No device' : currentDevice.name}</span>
          {!noDevice && <Badge t={t} variant="default" sm>{currentDevice.model}</Badge>}
        </div>
        {!noDevice && <>
          <Divider t={t} vertical length={20}/>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:12, color:t.text3 }}>Session</span>
            <span style={{ fontSize:12, color:t.text, fontFamily:t.mono }}>{selected.session}</span>
          </div>
        </>}
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <Btn t={t} variant="secondary" icon="refresh" compact>Reconnect</Btn>
          <Btn t={t} variant="ghost" compact>Clear</Btn>
        </div>
      </div>
      {noDevice ? <LogEmptyState t={t}/> : (
      <>
      {/* Filter bar */}
      <div style={logStyles.filterBar}>
        <SearchField t={t} placeholder="Filter by URL, method, status…" width={260}/>
        <div style={{ display:'flex', gap:6 }}>
          {['All','2xx','4xx','5xx','GET','POST'].map(f => <Chip key={f} t={t} active={f==='All'}>{f}</Chip>)}
        </div>
        <div style={{ marginLeft:'auto', fontSize:12, color:t.text3 }}>{LOG_DATA.length} requests · 2 devices</div>
      </div>
      {/* Body */}
      <div style={logStyles.body}>
        {/* Session rail — tracks device switches */}
        <div style={logStyles.sessionRail}>
          <div style={logStyles.listHeader}>
            <span style={{ fontSize:10, fontWeight:700, color:t.text3, textTransform:'uppercase', letterSpacing:0.6, fontFamily:t.mono }}>Sessions · by device</span>
          </div>
          <div style={{ flex:1, overflowY:'auto', background:t.bg }}>
            {SESSION_GROUPS.map((g, gi) => (
              <div key={g.device}>
                {/* device switch marker */}
                <div style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 12px 7px', background: t.id==='bold'?t.surface2:t.surface2, borderBottom:`1px solid ${t.border}`, borderTop: gi>0?`1px solid ${t.border}`:'none' }}>
                  <QAIcon name={g.device==='Android'?'android':'apple'} size={14} color={g.device===selected.device?t.accent:t.text2}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11.5, fontWeight:700, color:t.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{gi>0?'↳ Switched · ':''}{g.name}</div>
                    <div style={{ fontSize:10, color:t.text3, fontFamily:t.mono }}>from {g.from}</div>
                  </div>
                </div>
                {g.sessions.map(s => (
                  <div key={s.code} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px 8px 16px', borderBottom:`1px solid ${t.borderSubtle}`, cursor:'pointer', background: (s.active && g.device===selected.device) ? t.accentLight : 'transparent', borderLeft:`3px solid ${(s.active && g.device===selected.device)?t.accent:'transparent'}` }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background: s.status==='fail'?t.fail:t.pass, flexShrink:0 }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, color:t.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.label}</div>
                      <div style={{ fontSize:10, color:t.text3, fontFamily:t.mono }}>{s.code} · {s.reqs} req · {s.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        {/* Request list */}
        <div style={logStyles.requestList}>
          <div style={logStyles.listHeader}>
            {['','Method','Path','Status','Time'].map((h,i) => (
              <div key={i} style={{ fontSize:10, fontWeight:700, color:t.text3, textTransform:'uppercase', letterSpacing:0.5, fontFamily:t.mono, ...(i===0?{width:20}:i===1?{width:54}:i===2?{flex:1}:i===3?{width:48}:{width:48,textAlign:'right'}) }}>{h}</div>
            ))}
          </div>
          <div style={logStyles.listBody}>
            {LOG_DATA.map(entry => <LogListRow key={entry.id} entry={entry}/>)}
          </div>
        </div>
        {/* Detail panel */}
        <div style={logStyles.detailPanel}>
          <div style={logStyles.detailHeader}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <MethodPill t={t} method={selected.method}/>
              <div style={{ flex:1, fontSize:13, color:t.text, fontFamily:t.mono, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>https://api.acme.io{selected.path}</div>
              <div title="Copy URL" style={{ width:26, height:26, borderRadius:t.rSm, border:`1px solid ${t.border}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}><QAIcon name="copy" size={12} color={t.text2}/></div>
              <StatusCode t={t} code={selected.status}/>
              <div style={{ fontSize:12, color:t.text3, fontFamily:t.mono, flexShrink:0 }}>{selected.ms}ms</div>
            </div>
            <StatMeta t={t} entry={selected}/>
          </div>
          {/* Tabs */}
          <div style={logStyles.tabBar}>
            {tabs.map(tab => (
              <div key={tab} onClick={() => setActiveTab(tab)} style={{ padding:'0 18px', height:36, display:'flex', alignItems:'center', fontSize:13, fontWeight: activeTab===tab ? 600 : 400, color: activeTab===tab ? t.accent : t.text2, borderBottom:`2px solid ${activeTab===tab ? t.accent : 'transparent'}`, cursor:'pointer' }}>{tab}</div>
            ))}
          </div>
          {/* Tab content */}
          <div style={logStyles.tabContent}>
            {activeTab === 'Overview' && (
              <div style={{ padding:16 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  {(isImage
                    ? [ {label:'Status Code', val:'200 OK', color:t.pass}, {label:'Content-Type', val:'image/png'}, {label:'Dimensions', val:'240 × 240'}, {label:'Response Size', val:'18.4 KB'} ]
                    : [ {label:'Status Code', val:'422 Unprocessable', color:t.warn}, {label:'Duration', val:`${selected.ms}ms`}, {label:'Request Size', val:'384 B'}, {label:'Response Size', val:'212 B'} ]
                  ).map(s => (
                    <div key={s.label} style={{ padding:'12px 14px', borderRadius:t.r, background:t.surface, border:`1px solid ${t.border}` }}>
                      <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:0.6, color:t.text3, fontFamily:t.mono, marginBottom:4 }}>{s.label}</div>
                      <div style={{ fontSize:14, fontWeight:600, color: s.color || t.text, fontFamily:t.mono }}>{s.val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'Request' && (
              <div>
                <BodyToolbar t={t} label="Headers"/>
                {reqHeaders.map(h => (
                  <div key={h.key} style={logStyles.headerRow}>
                    <div style={logStyles.headerKey}>{h.key}</div>
                    <div style={logStyles.headerVal}>{h.val}</div>
                  </div>
                ))}
                <BodyToolbar t={t} label="Body · JSON"/>
                <div style={{ padding:'10px 8px', fontFamily:t.mono, fontSize:12, lineHeight:1.7 }}>
                  <JsonNode t={t} k={null} value={REQ_BODY} depth={0} last/>
                </div>
              </div>
            )}
            {activeTab === 'Response' && (
              isImage ? (
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderBottom:`1px solid ${t.border}`, background: t.id==='bold'?t.surface2:t.surface }}>
                    <QAIcon name="image" size={13} color={t.accent}/>
                    <span style={{ fontSize:11, fontWeight:700, color:t.text3, textTransform:'uppercase', letterSpacing:0.6, fontFamily:t.mono }}>Rendered Image · image/png</span>
                    <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:5, height:26, padding:'0 9px', borderRadius:t.rSm, border:`1px solid ${t.border}`, background:t.surface, cursor:'pointer' }}><QAIcon name="copy" size={12} color={t.text2}/><span style={{ fontSize:11.5, fontWeight:600, color:t.text2 }}>Copy URL</span></div>
                    </div>
                  </div>
                  <div style={{ padding:24, display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
                    <img src={IMG_URI} alt="response" style={{ width:240, height:240, borderRadius:t.r, border:`1px solid ${t.border}`, boxShadow:t.shadowMd }}/>
                    <div style={{ fontSize:11.5, color:t.text3, fontFamily:t.mono }}>P-84921 · 240×240 · 18.4 KB</div>
                  </div>
                </div>
              ) : (
                <div>
                  <BodyToolbar t={t} label="Headers"/>
                  {resHeaders.map(h => (
                    <div key={h.key} style={logStyles.headerRow}>
                      <div style={logStyles.headerKey}>{h.key}</div>
                      <div style={logStyles.headerVal}>{h.val}</div>
                    </div>
                  ))}
                  <BodyToolbar t={t} label="Body · JSON"/>
                  <div style={{ padding:'10px 8px', fontFamily:t.mono, fontSize:12, lineHeight:1.7 }}>
                    <JsonNode t={t} k={null} value={RES_BODY} depth={0} last/>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>
      </>
      )}
    </AppShell>
  );
};

Object.assign(window, { LogInspectorScreen });
