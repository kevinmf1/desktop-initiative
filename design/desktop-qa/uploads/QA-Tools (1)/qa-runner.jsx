// qa-runner.jsx — Manual Runner. Two devices (iOS + Android) run the same plan
// SIDE BY SIDE. The verdict (Pass / Fail / Bug) is set per device at the case
// level — test steps are shown for reference only, they don't drive the result.
// Results are buffered on-device and uploaded when the session finishes.

const RUN_DEVICES = [
  { id:'ios',     platform:'iOS',     name:"Marco's iPhone 14 Pro", model:'iPhone14,3' },
  { id:'android', platform:'Android', name:'Pixel 8 · Emulator',    model:'Pixel 8 / API 34' },
];

// Per-device status for each case (pass / fail / bug / running / pending / blocked)
const RUN_CASES = [
  { code:'TC-001', title:'User login with valid credentials',        ios:'pass',    android:'pass' },
  { code:'TC-002', title:'Login fails with incorrect password',      ios:'pass',    android:'pass' },
  { code:'TC-003', title:'Password reset via email link',            ios:'running', android:'bug' },
  { code:'TC-004', title:'Product search returns filtered results',  ios:'pending', android:'running' },
  { code:'TC-005', title:'Add item to cart from product detail',     ios:'pending', android:'pending' },
  { code:'TC-006', title:'Checkout with saved payment method',       ios:'pending', android:'pending' },
  { code:'TC-007', title:'Apply coupon code at checkout',            ios:'pending', android:'pending' },
  { code:'TC-008', title:'Order confirmation triggers email',        ios:'pending', android:'pending' },
];

// Reference steps for the active case (informational only)
const ACTIVE_STEPS = [
  { text:'Navigate to the login screen',    expect:'Login form is displayed' },
  { text:'Tap “Forgot password?” link',     expect:'Reset request screen opens' },
  { text:'Enter registered email & submit', expect:'Confirmation toast appears' },
  { text:'Open reset link from email',      expect:'New-password form is shown' },
];

const DEV_LOGS = {
  ios: [
    { method:'POST', url:'/api/v1/auth/forgot-password',      status:200, ms:203, ts:'04:23:14' },
    { method:'GET',  url:'/api/v1/auth/reset-token/validate', status:200, ms:67,  ts:'04:23:19' },
    { method:'POST', url:'/api/v1/auth/reset-password',       status:null, ms:'—', ts:'04:23:31', inProgress:true },
  ],
  android: [
    { method:'POST', url:'/api/v1/auth/forgot-password',      status:200,  ms:188,  ts:'04:23:15' },
    { method:'GET',  url:'/api/v1/auth/reset-token/validate', status:500,  ms:1203, ts:'04:23:22' },
  ],
};

const runStat = (t) => ({
  pass:    { c:t.pass,    bg:t.passLight,    b:t.passBorder,    label:'Pass',    icon:'check' },
  fail:    { c:t.fail,    bg:t.failLight,    b:t.failBorder,    label:'Fail',    icon:'x' },
  bug:     { c:t.warn,    bg:t.warnLight,    b:t.warnBorder,    label:'Bug',     icon:'bug' },
  running: { c:t.accent,  bg:t.accentLight,  b:t.accentBorder,  label:'Running', icon:null },
  blocked: { c:t.blocked, bg:t.blockedLight, b:t.blockedBorder, label:'Blocked', icon:'block' },
  pending: { c:t.skip,    bg:t.skipLight,    b:t.skipBorder,    label:'—',       icon:null },
});

const DeviceChip = ({ t, platform, status }) => {
  const s = runStat(t)[status] || runStat(t).pending;
  return (
    <div title={`${platform}: ${s.label}`} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 7px', borderRadius:t.rFull, background:s.bg, border:`1px solid ${s.b}` }}>
      <QAIcon name={platform==='Android'?'android':'apple'} size={11} color={s.c}/>
      {s.icon ? <QAIcon name={s.icon} size={10} color={s.c}/> : <span style={{ width:5, height:5, borderRadius:'50%', background:s.c, boxShadow: status==='running'?`0 0 0 2px ${t.liveGlow}`:'none' }}/>}
      <span style={{ fontSize:10, fontWeight:700, color:s.c, fontFamily:t.font }}>{s.label}</span>
    </div>
  );
};

const RunCaseRow = ({ t, c, index, activeCode }) => {
  const hl = c.code === activeCode;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 16px', background: hl ? t.accentLight : 'transparent', borderLeft:`3px solid ${hl ? t.accent : 'transparent'}`, borderBottom:`1px solid ${t.borderSubtle}` }}>
      <span style={{ width:20, fontSize:11, fontWeight:600, color:t.text3, fontFamily:t.mono, flexShrink:0 }}>{index+1}</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight: hl?600:400, color:t.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.title}</div>
        <div style={{ fontSize:11, color:t.text3, fontFamily:t.mono, marginTop:2 }}>{c.code}</div>
      </div>
      <div style={{ display:'flex', gap:5, flexShrink:0 }}>
        <DeviceChip t={t} platform="iOS" status={c.ios}/>
        <DeviceChip t={t} platform="Android" status={c.android}/>
      </div>
    </div>
  );
};

// Prominent per-platform verdict buttons
const VerdictButtons = ({ t, current }) => {
  const defs = [
    { key:'pass', label:'Pass', color:t.pass, bg:t.passLight, border:t.passBorder, icon:'check' },
    { key:'fail', label:'Fail', color:t.fail, bg:t.failLight, border:t.failBorder, icon:'x' },
    { key:'bug',  label:'Bug',  color:t.warn, bg:t.warnLight, border:t.warnBorder, icon:'bug' },
  ];
  return (
    <div style={{ display:'flex', gap:8 }}>
      {defs.map(d => {
        const active = current === d.key;
        return (
          <div key={d.key} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:'13px 8px', borderRadius:t.r, cursor:'pointer', background: active ? d.color : d.bg, border:`1.5px solid ${active ? d.color : d.border}`, boxShadow: active ? t.shadowMd : 'none' }}>
            <QAIcon name={d.icon} size={20} color={active ? '#fff' : d.color}/>
            <span style={{ fontSize:13, fontWeight:700, color: active ? '#fff' : d.color, fontFamily:t.font }}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
};

const StepRow = ({ t, step, index }) => (
  <div style={{ display:'flex', gap:9, padding:'8px 0', borderBottom:`1px solid ${t.borderSubtle}` }}>
    <div style={{ width:20, height:20, borderRadius:'50%', background:t.surface2, border:`1px solid ${t.border}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <span style={{ fontSize:10, fontWeight:700, color:t.text3, fontFamily:t.mono }}>{index+1}</span>
    </div>
    <div style={{ flex:1 }}>
      <div style={{ fontSize:12.5, color:t.text, marginBottom:2 }}>{step.text}</div>
      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
        <QAIcon name="chevronRight" size={10} color={t.text3}/>
        <span style={{ fontSize:11.5, color:t.text3 }}>{step.expect}</span>
      </div>
    </div>
  </div>
);

const DevLog = ({ t, logs, platform }) => (
  <div style={{ borderTop:`1px solid ${t.border}`, display:'flex', flexDirection:'column', flexShrink:0, background: t.id==='bold'?t.bg:'#FAFBFC' }}>
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', borderBottom:`1px solid ${t.border}`, background:t.surface }}>
      <LiveDot t={t} active/>
      <span style={{ fontSize:11.5, color:t.text2 }}>{platform} log · {logs.length}</span>
    </div>
    <div style={{ maxHeight:118, overflowY:'auto' }}>
      {logs.map((e, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', borderBottom:`1px solid ${t.borderSubtle}`, background: e.status>=500?t.failLight:'transparent', opacity:e.inProgress?0.7:1 }}>
          <MethodPill t={t} method={e.method}/>
          <div style={{ flex:1, fontSize:11.5, color:t.text, fontFamily:t.mono, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.url}</div>
          {e.status ? <StatusCode t={t} code={e.status}/> : <span style={{ fontSize:11, color:t.accent, fontFamily:t.mono }}>…</span>}
          <div style={{ fontSize:10.5, color:t.text3, fontFamily:t.mono, width:44, textAlign:'right' }}>{e.inProgress?'…':`${e.ms}ms`}</div>
        </div>
      ))}
    </div>
  </div>
);

const PlatformColumn = ({ t, device, verdict, logs, border }) => (
  <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', overflow:'hidden', borderRight: border ? `1px solid ${t.border}` : 'none' }}>
    {/* Device header */}
    <div style={{ display:'flex', alignItems:'center', gap:9, padding:'11px 16px', borderBottom:`1px solid ${t.border}`, background:t.surface, flexShrink:0 }}>
      <QAIcon name={device.platform==='Android'?'android':'apple'} size={18} color={t.text}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13.5, fontWeight:700, color:t.text }}>{device.platform}</div>
        <div style={{ fontSize:10.5, color:t.text3, fontFamily:t.mono, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{device.name}</div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
        <span style={{ width:6, height:6, borderRadius:'50%', background:t.live, boxShadow:`0 0 0 2px ${t.liveGlow}` }}/>
        <span style={{ fontSize:10.5, fontWeight:600, color:t.live }}>Live</span>
      </div>
    </div>
    {/* Verdict (the action) */}
    <div style={{ padding:'12px 16px', borderBottom:`1px solid ${t.border}`, background: t.id==='bold'?t.bg:'#FAFBFC', flexShrink:0 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <span style={{ fontSize:10, fontWeight:700, color:t.text3, textTransform:'uppercase', letterSpacing:0.6, fontFamily:t.mono }}>Verdict</span>
        {!verdict && <span style={{ fontSize:11, color:t.accent, fontWeight:600 }}>Awaiting result…</span>}
      </div>
      <VerdictButtons t={t} current={verdict}/>
    </div>
    {/* Steps (reference only) */}
    <div style={{ flex:1, overflowY:'auto', padding:'10px 16px', background:t.surface }}>
      <span style={{ fontSize:10, fontWeight:700, color:t.text3, textTransform:'uppercase', letterSpacing:0.6, fontFamily:t.mono, display:'block', marginBottom:4 }}>Steps · for reference</span>
      {ACTIVE_STEPS.map((s, i) => <StepRow key={i} t={t} step={s} index={i}/>)}
    </div>
    {/* Device log */}
    <DevLog t={t} logs={logs} platform={device.platform}/>
  </div>
);

const RunnerScreen = ({ t }) => {
  const activeCase = RUN_CASES.find(c => c.ios==='running' || c.android==='running' || c.ios==='bug' || c.android==='bug') || RUN_CASES[2];
  const verdictOf = (s) => (['pass','fail','bug'].includes(s) ? s : null);

  const S = {
    sessionBar: { height:60, background: t.id==='bold' ? t.surface : '#1A2233', borderBottom:`1px solid ${t.id==='bold'?t.border:'#243044'}`, display:'flex', alignItems:'center', padding:'0 20px', flexShrink:0 },
    body: { flex:1, display:'flex', overflow:'hidden' },
    leftPanel: { width:452, borderRight:`1px solid ${t.border}`, display:'flex', flexDirection:'column', overflow:'hidden', flexShrink:0 },
    leftHeader: { padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`1px solid ${t.border}`, background:t.surface, flexShrink:0 },
    caseList: { flex:1, overflowY:'auto', background:t.bg },
    rightPanel: { flex:1, display:'flex', flexDirection:'column', overflow:'hidden' },
  };
  const stColor = t.id==='bold' ? t.text : '#E2E8F0';
  const smColor = t.id==='bold' ? t.text2 : '#94A3B8';

  return (
    <AppShell t={t} active="runner">
      {/* Session Header */}
      <div style={S.sessionBar}>
        <div style={{ display:'flex', flexDirection:'column', gap:2, flex:1 }}>
          <div style={{ color:stColor, fontSize:14, fontWeight:700, fontFamily:t.font }}>Regression Suite v2.4</div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, color:smColor }}><QAIcon name="apple" size={11} color={smColor}/><QAIcon name="android" size={11} color={smColor}/> 2 devices</span>
            <span style={{ color: t.id==='bold' ? t.text3 : '#475569' }}>·</span>
            <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, color:smColor }}><span style={{ width:5, height:5, borderRadius:'50%', background:t.warn }}/>Staging</span>
            <span style={{ color: t.id==='bold' ? t.text3 : '#475569' }}>·</span>
            <span style={{ fontSize:11, color:smColor, fontFamily:t.mono }}>Build 2.4.1 · SDK</span>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginRight:16, padding:'5px 11px', borderRadius:t.rFull, background: t.id==='bold' ? 'rgba(56,139,253,0.12)' : 'rgba(255,255,255,0.08)', border:`1px solid ${t.id==='bold'?t.accentBorder:'rgba(255,255,255,0.12)'}` }}>
          <QAIcon name="upload" size={12} color={t.id==='bold'?t.accentText:'#93C5FD'}/>
          <span style={{ fontSize:11, fontWeight:600, color: t.id==='bold'?t.accentText:'#93C5FD', fontFamily:t.font }}>Buffered · uploads on finish</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginRight:12, padding:'6px 12px', borderRadius:t.r, background: t.id==='bold' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.15)', border:`1px solid ${t.id==='bold'?t.border:'rgba(255,255,255,0.08)'}` }}>
          <QAIcon name="timer" size={14} color={smColor}/>
          <span style={{ fontSize:14, fontWeight:700, color:stColor, fontFamily:t.mono }}>00:04:32</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:t.r, background:'rgba(248,81,73,0.12)', border:`1px solid rgba(248,81,73,0.25)`, cursor:'pointer' }}>
          <QAIcon name="stop" size={13} color={t.fail}/>
          <span style={{ fontSize:13, fontWeight:600, color:t.fail, fontFamily:t.font }}>Stop</span>
        </div>
      </div>
      {/* Body */}
      <div style={S.body}>
        {/* Left: Case list with per-device status */}
        <div style={S.leftPanel}>
          <div style={S.leftHeader}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:13, fontWeight:600, color:t.text }}>Test Cases</span>
              <Badge t={t} variant="default" sm>{RUN_CASES.length}</Badge>
            </div>
            <span style={{ fontSize:10.5, color:t.text3, fontFamily:t.mono }}>iOS · Android →</span>
          </div>
          <div style={S.caseList}>
            {RUN_CASES.map((c, i) => <RunCaseRow key={c.code} t={t} c={c} index={i} activeCode={activeCase.code}/>)}
          </div>
          <div style={{ padding:'10px 16px', borderTop:`1px solid ${t.border}`, background:t.surface, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <span style={{ fontSize:12, color:t.text2 }}>iOS 2/8 · Android 2/8 complete</span>
            <div style={{ display:'flex', gap:6 }}>
              <Badge t={t} variant="pass" sm>4 Pass</Badge>
              <Badge t={t} variant="warn" sm>1 Bug</Badge>
            </div>
          </div>
        </div>
        {/* Right: two platforms side by side */}
        <div style={S.rightPanel}>
          {/* Active case header + bulk verdicts */}
          <div style={{ padding:'11px 18px', borderBottom:`1px solid ${t.border}`, background:t.surface, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <div style={{ minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:11, color:t.text3, fontFamily:t.mono, fontWeight:600 }}>{activeCase.code}</span>
                <span style={{ fontSize:10, fontWeight:700, color:t.accent, textTransform:'uppercase', letterSpacing:0.5, fontFamily:t.mono }}>Now testing</span>
              </div>
              <div style={{ fontSize:14.5, fontWeight:700, color:t.text, marginTop:2 }}>{activeCase.title}</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
              <span style={{ fontSize:11, color:t.text3, marginRight:2 }}>Apply to both:</span>
              <div style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 13px', borderRadius:t.r, background:t.passLight, border:`1.5px solid ${t.passBorder}`, cursor:'pointer' }}>
                <QAIcon name="check" size={14} color={t.pass}/><span style={{ fontSize:12.5, fontWeight:700, color:t.pass }}>Pass All</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 13px', borderRadius:t.r, background:t.failLight, border:`1.5px solid ${t.failBorder}`, cursor:'pointer' }}>
                <QAIcon name="x" size={14} color={t.fail}/><span style={{ fontSize:12.5, fontWeight:700, color:t.fail }}>Fail All</span>
              </div>
            </div>
          </div>
          {/* Two device columns */}
          <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
            <PlatformColumn t={t} device={RUN_DEVICES[0]} verdict={verdictOf(activeCase.ios)} logs={DEV_LOGS.ios} border/>
            <PlatformColumn t={t} device={RUN_DEVICES[1]} verdict={verdictOf(activeCase.android)} logs={DEV_LOGS.android}/>
          </div>
        </div>
      </div>
      {/* Bottom bar: finish uploads results */}
      <div style={{ height:52, background:t.surface, borderTop:`1px solid ${t.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 20px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <QAIcon name="info" size={14} color={t.text3}/>
          <span style={{ fontSize:12.5, color:t.text2 }}>Results are buffered on each device and <strong style={{ color:t.text }}>uploaded when the session finishes</strong> — nothing is sent mid-run.</span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <Btn t={t} variant="secondary">Pause</Btn>
          <Btn t={t} variant="primary" icon="upload">Finish &amp; Upload Results</Btn>
        </div>
      </div>
    </AppShell>
  );
};

Object.assign(window, { RunnerScreen });
