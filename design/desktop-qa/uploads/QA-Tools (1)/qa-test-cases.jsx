// qa-test-cases.jsx — Test Cases: hybrid listing (group by case, expandable
// instances) + tabbed detail panel + 3-dot menu + Add-to-Plan modal.
// Data model: Test Case (canonical content) ⟶ Metadata (case×plan instance,
// holds per-plan status/PIC/updated) ⟶ Test Plan.

// ── People (PIC) ──────────────────────────────────────────────────────────────
const PEOPLE = {
  MK: { name: 'Marco K.', color: '#2563EB' },
  AR: { name: 'Aisha R.', color: '#7C3AED' },
  TN: { name: 'Tom N.',   color: '#0891B2' },
  SL: { name: 'Sara L.',  color: '#DB2777' },
  JP: { name: 'Jon P.',   color: '#059669' },
};

// ── Canonical cases + their plan instances (metadata) ─────────────────────────
const CASES = [
  { id:'TC-001', title:'User login with valid credentials', priority:'high', platform:'iOS', platforms:['iOS','Android'], build:'2.4.1', tags:['Auth'], updated:'2h ago', stepCount:4,
    instances:[
      { plan:'Authentication Suite', status:'pass', pic:'AR', updated:'2h ago' },
      { plan:'Smoke Tests',          status:'pass', pic:'MK', updated:'3h ago' },
      { plan:'Regression Suite v2.4', status:'pass', pic:'MK', updated:'1d ago' },
    ]},
  { id:'TC-002', title:'Login fails with incorrect password', priority:'high', platform:'iOS', platforms:['iOS','Android'], build:'2.4.1', tags:['Auth','Validation'], updated:'2h ago', stepCount:3,
    instances:[
      { plan:'Authentication Suite', status:'pass', pic:'AR', updated:'2h ago' },
      { plan:'Regression Suite v2.4', status:'pass', pic:'MK', updated:'1d ago' },
    ]},
  { id:'TC-003', title:'Password reset via email link', priority:'medium', platform:'iOS', platforms:['iOS'], build:'2.4.1', tags:['Auth'], updated:'12m ago', stepCount:4,
    instances:[
      { plan:'Authentication Suite', status:'pass',    pic:'AR', updated:'12m ago' },
      { plan:'Regression Suite v2.4', status:'running', pic:'MK', updated:'1m ago' },
    ]},
  { id:'TC-004', title:'Product search returns filtered results', priority:'medium', platform:'iOS', platforms:['iOS','Android'], build:'2.4.1', tags:['Search'], updated:'1d ago', stepCount:5,
    instances:[
      { plan:'Search & Discovery',   status:'pass', pic:'TN', updated:'1d ago' },
      { plan:'Regression Suite v2.4', status:'pending', pic:'MK', updated:'1d ago' },
    ]},
  { id:'TC-005', title:'Add item to cart from product detail page', priority:'high', platform:'iOS', platforms:['iOS'], build:'2.4.1', tags:['Cart'], updated:'3d ago', stepCount:4,
    instances:[
      { plan:'Checkout Flow',        status:'pass', pic:'SL', updated:'3d ago' },
      { plan:'Regression Suite v2.4', status:'pending', pic:'MK', updated:'3d ago' },
    ]},
  { id:'TC-006', title:'Checkout with saved payment method', priority:'critical', platform:'iOS', platforms:['iOS','Android'], build:'2.4.1', tags:['Checkout','Payments'], updated:'18m ago', stepCount:6,
    instances:[
      { plan:'Checkout Flow',        status:'fail',    pic:'SL', updated:'18m ago' },
      { plan:'Regression Suite v2.4', status:'blocked', pic:'MK', updated:'1d ago' },
    ]},
  { id:'TC-006·b', title:'Checkout with saved payment — EU VAT variant', priority:'high', platform:'iOS', platforms:['iOS'], build:'2.4.1', tags:['Checkout','Payments'], updated:'1d ago', stepCount:7, forkedFrom:'TC-006',
    instances:[
      { plan:'Checkout Flow', status:'pass', pic:'JP', updated:'1d ago' },
    ]},
  { id:'TC-007', title:'Apply coupon code at checkout', priority:'medium', platform:'iOS', platforms:['Android'], build:'2.3.9', tags:['Checkout'], updated:'5d ago', stepCount:4,
    instances:[
      { plan:'Checkout Flow', status:'pass', pic:'SL', updated:'5d ago' },
    ]},
  { id:'TC-008', title:'Order confirmation triggers email notification', priority:'low', platform:'iOS', platforms:['iOS','Android'], build:'2.4.1', tags:['Orders','Email'], updated:'1w ago', stepCount:3, draft:true,
    instances:[
      { plan:'Regression Suite v2.4', status:'pending', pic:'MK', updated:'1w ago' },
    ]},
];

const ALL_PLANS = ['Regression Suite v2.4','Checkout Flow','Authentication Suite','Smoke Tests','Search & Discovery','Onboarding Flow'];

// ── Small atoms ───────────────────────────────────────────────────────────────
const Avatar = ({ t, pic, size = 22 }) => {
  const p = PEOPLE[pic] || { name: pic, color: '#6B7280' };
  return (
    <div title={p.name} style={{ width:size, height:size, borderRadius:'50%', background:p.color, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:size*0.4, fontWeight:700, fontFamily:t.font, flexShrink:0, border:`1.5px solid ${t.surface}` }}>{pic.replace('·','')}</div>
  );
};

const AvatarStack = ({ t, pics }) => (
  <div style={{ display:'flex', alignItems:'center' }}>
    {pics.slice(0,3).map((pic, i) => (
      <div key={i} style={{ marginLeft: i === 0 ? 0 : -7 }}><Avatar t={t} pic={pic} size={22}/></div>
    ))}
    {pics.length > 3 && <div style={{ marginLeft:-7, width:22, height:22, borderRadius:'50%', background:t.surface2, border:`1.5px solid ${t.surface}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:t.text2 }}>+{pics.length-3}</div>}
  </div>
);

const priorityStyle = (t, p) => ({
  critical:{ color:t.fail, bg:t.failLight, border:t.failBorder },
  high:    { color:t.warn, bg:t.warnLight, border:t.warnBorder },
  medium:  { color:t.accent, bg:t.accentLight, border:t.accentBorder },
  low:     { color:t.skip, bg:t.skipLight, border:t.skipBorder },
}[p] || { color:t.skip, bg:t.skipLight, border:t.skipBorder });

const PriorityTag = ({ t, priority }) => {
  const s = priorityStyle(t, priority);
  return <div style={{ display:'inline-flex', padding:'2px 8px', borderRadius:t.rFull, background:s.bg, border:`1px solid ${s.border}`, fontSize:10, fontWeight:600, color:s.color, textTransform:'capitalize' }}>{priority}</div>;
};

const STATUS_META = (t) => ({
  pass:    { label:'Pass',    color:t.pass,    bg:t.passLight,    border:t.passBorder },
  fail:    { label:'Fail',    color:t.fail,    bg:t.failLight,    border:t.failBorder },
  blocked: { label:'Blocked', color:t.blocked, bg:t.blockedLight, border:t.blockedBorder },
  running: { label:'Running', color:t.accent,  bg:t.accentLight,  border:t.accentBorder },
  pending: { label:'Pending', color:t.skip,    bg:t.skipLight,    border:t.skipBorder },
});

const StatusBadge = ({ t, status, sm }) => {
  const m = STATUS_META(t)[status] || STATUS_META(t).pending;
  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding: sm ? '2px 8px' : '3px 9px', borderRadius:t.rFull, background:m.bg, color:m.color, border:`1px solid ${m.border}`, fontSize: sm ? 10 : 11, fontWeight:600 }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:m.color, boxShadow: status==='running' ? `0 0 0 2px ${t.liveGlow}` : 'none' }}/>
      {m.label}
    </div>
  );
};

// Single roll-up summary across ALL plan instances / platforms → one badge.
// Rules: any Fail → "Has Fail"; every instance Pass → "All Done"; otherwise "Not Run Yet".
const caseSummary = (instances) => {
  if (instances.some(i => i.status === 'fail' || i.status === 'blocked')) return 'hasFail';
  if (instances.length && instances.every(i => i.status === 'pass')) return 'allDone';
  return 'notRun';
};
const SUMMARY_META = (t) => ({
  allDone: { label:'All Done',    color:t.pass, bg:t.passLight, border:t.passBorder },
  hasFail: { label:'Has Fail',    color:t.fail, bg:t.failLight, border:t.failBorder },
  notRun:  { label:'Not Run Yet', color:t.skip, bg:t.skipLight, border:t.skipBorder },
});
const RollupStatus = ({ t, instances }) => {
  const m = SUMMARY_META(t)[caseSummary(instances)];
  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'3px 10px', borderRadius:t.rFull, background:m.bg, color:m.color, border:`1px solid ${m.border}`, fontSize:11, fontWeight:600 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:m.color }}/>
      {m.label}
    </div>
  );
};

// ── Instance sub-row (expanded) ───────────────────────────────────────────────
const InstanceRow = ({ t, inst, last }) => (
  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 16px 8px 50px', background: t.id==='bold' ? 'rgba(255,255,255,0.015)' : 'rgba(37,99,235,0.02)', borderBottom: last ? 'none' : `1px solid ${t.borderSubtle}` }}>
    <QAIcon name="testPlan" size={13} color={t.text3}/>
    <div style={{ flex:1, fontSize:12.5, color:t.text, fontFamily:t.font }}>{inst.plan}</div>
    <div style={{ width:90 }}><StatusBadge t={t} status={inst.status} sm/></div>
    <div style={{ width:34, display:'flex', justifyContent:'center' }}><Avatar t={t} pic={inst.pic} size={20}/></div>
    <div style={{ width:72, fontSize:11, color:t.text3, fontFamily:t.font }}>{inst.updated}</div>
    <div style={{ width:30, display:'flex', justifyContent:'center', cursor:'pointer' }}><QAIcon name="link" size={13} color={t.text3}/></div>
  </div>
);

// ── Case row (group header, expandable) ───────────────────────────────────────
const TC_COLS = { exp:30, id:84, status:132, plans:60, plat:84, updated:96, pic:104 };

const TcCaseRow = ({ t, c, selected, expanded, onSelect, onExpand }) => {
  const pics = [...new Set(c.instances.map(i => i.pic))];
  const COLS = TC_COLS;
  return (
    <div style={{ borderBottom:`1px solid ${t.borderSubtle}`, background: selected ? t.accentLight : 'transparent', position:'relative' }}>
      <div style={{ display:'flex', alignItems:'center', height:50, cursor:'pointer', borderLeft:`3px solid ${selected ? t.accent : 'transparent'}` }} onClick={onSelect}>
        <div style={{ width:COLS.exp, display:'flex', justifyContent:'center', cursor:'pointer' }} onClick={(e)=>{e.stopPropagation(); onExpand();}}>
          <div style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition:'transform 0.15s' }}><QAIcon name="chevronRight" size={13} color={t.text3}/></div>
        </div>
        <div style={{ width:COLS.id, flexShrink:0 }}>
          <span style={{ fontSize:11, color: c.forkedFrom ? t.blocked : t.text3, fontFamily:t.mono, fontWeight: c.forkedFrom ? 600 : 400 }}>{c.id}</span>
        </div>
        <div style={{ flex:1, minWidth:0, paddingRight:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:13, color: selected ? t.text : (c.draft ? t.text2 : t.text), fontWeight: selected ? 600 : 400, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.title}</span>
            {c.draft && <Badge t={t} variant="default" sm>Draft</Badge>}
          </div>
          {c.forkedFrom && (
            <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:2 }}>
              <QAIcon name="fork" size={10} color={t.blocked}/>
              <span style={{ fontSize:10.5, color:t.blocked, fontFamily:t.mono }}>forked from {c.forkedFrom}</span>
            </div>
          )}
        </div>
        <div style={{ width:COLS.status, flexShrink:0 }}><RollupStatus t={t} instances={c.instances}/></div>
        <div style={{ width:COLS.plans, flexShrink:0 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:t.rFull, background:t.surface2, border:`1px solid ${t.border}` }}>
            <QAIcon name="testPlan" size={11} color={t.text3}/>
            <span style={{ fontSize:11, fontWeight:700, color:t.text2, fontFamily:t.mono }}>{c.instances.length}</span>
          </div>
        </div>
        <div style={{ width:COLS.plat, display:'flex', alignItems:'center', gap:7, flexShrink:0 }}>
          {(c.platforms || [c.platform]).map(pl => (
            <QAIcon key={pl} name={pl==='Android'?'android':'apple'} size={15} color={t.text2}/>
          ))}
        </div>
        <div style={{ width:COLS.updated, fontSize:11, color:t.text3, flexShrink:0 }}>{c.updated}</div>
        <div style={{ width:COLS.pic, flexShrink:0 }}><AvatarStack t={t} pics={pics}/></div>
      </div>
      {expanded && (
        <div style={{ paddingBottom:4 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'5px 16px 5px 50px' }}>
            <span style={{ fontSize:10, fontWeight:700, color:t.text3, textTransform:'uppercase', letterSpacing:0.6, fontFamily:t.mono }}>Instances · {c.instances.length} plans</span>
          </div>
          {c.instances.map((inst, i) => <InstanceRow key={i} t={t} inst={inst} last={i === c.instances.length-1}/>)}
        </div>
      )}
    </div>
  );
};

// ── Detail panel (tabbed) ─────────────────────────────────────────────────────
const STEPS_TC003 = [
  { action:'Navigate to the login screen', expect:'Login form is displayed' },
  { action:'Tap "Forgot password?" link', expect:'Reset request screen opens' },
  { action:'Enter registered email & submit', expect:'Confirmation toast appears' },
  { action:'Open reset link from email', expect:'New-password form is shown' },
];
const CHANGELOG_TC003 = [
  { who:'AR', action:'changed status to', target:'Pass', plan:'Authentication Suite', when:'12m ago', type:'status' },
  { who:'MK', action:'started run in', target:'Regression Suite v2.4', plan:null, when:'1m ago', type:'run' },
  { who:'AR', action:'edited', target:'Step 3', plan:null, when:'1d ago', type:'edit' },
  { who:'MK', action:'linked case to', target:'Regression Suite v2.4', plan:null, when:'3d ago', type:'link' },
  { who:'MK', action:'created case', target:null, plan:null, when:'1w ago', type:'create' },
];

const DetailPanel = ({ t, c }) => {
  const [tab, setTab] = React.useState('Information');
  const tabs = ['Information','Steps','Change Log','Related Plans'];
  const ds = {
    wrap:{ width:400, borderLeft:`1px solid ${t.border}`, background:t.surface, display:'flex', flexDirection:'column', flexShrink:0 },
    head:{ padding:'14px 18px', borderBottom:`1px solid ${t.border}` },
    body:{ flex:1, overflowY:'auto' },
    tabBar:{ display:'flex', borderBottom:`1px solid ${t.border}`, paddingLeft:8 },
    tab:(a)=>({ padding:'0 12px', height:38, display:'flex', alignItems:'center', fontSize:12.5, fontWeight: a?600:400, color: a?t.accent:t.text2, borderBottom:`2px solid ${a?t.accent:'transparent'}`, cursor:'pointer', whiteSpace:'nowrap' }),
    label:{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:0.7, color:t.text3, fontFamily:t.mono, marginBottom:8, display:'block' },
    infoRow:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 0', borderBottom:`1px solid ${t.borderSubtle}` },
    infoKey:{ fontSize:12.5, color:t.text2 },
  };
  return (
    <div style={ds.wrap}>
      <div style={ds.head}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, marginBottom:10 }}>
          <div style={{ minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
              <span style={{ fontSize:12, color:t.text3, fontFamily:t.mono, fontWeight:600 }}>{c.id}</span>
              {c.forkedFrom && <div style={{ display:'flex', alignItems:'center', gap:3 }}><QAIcon name="fork" size={10} color={t.blocked}/><span style={{ fontSize:10, color:t.blocked, fontFamily:t.mono }}>from {c.forkedFrom}</span></div>}
            </div>
            <div style={{ fontSize:15, fontWeight:700, color:t.text, lineHeight:1.3 }}>{c.title}</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <Btn t={t} variant="primary" icon="play">Run Test</Btn>
          <Btn t={t} variant="secondary" icon="edit" compact>Edit</Btn>
          <Btn t={t} variant="secondary" icon="fork" compact>Duplicate</Btn>
        </div>
      </div>
      <div style={ds.tabBar}>
        {tabs.map(x => <div key={x} style={ds.tab(tab===x)} onClick={()=>setTab(x)}>{x}</div>)}
      </div>
      <div style={ds.body}>
        {tab==='Information' && (
          <div style={{ padding:'16px 18px' }}>
            <span style={ds.label}>Table Information</span>
            <div style={{ marginBottom:20 }}>
              {[
                ['ID', <span style={{ fontFamily:t.mono, fontSize:12.5, color:t.text }}>{c.id}</span>],
                ['Status', <RollupStatus t={t} instances={c.instances}/>],
                ['Platform', <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12.5, color:t.text }}><QAIcon name={c.platform==='Android'?'android':'apple'} size={12} color={t.text3}/>{c.platform} <span style={{ fontSize:10, color:t.text3, fontFamily:t.mono }}>SDK</span></span>],
                ['Test Build', <span style={{ fontFamily:t.mono, fontSize:12.5, color:t.text }}>{c.build} <span style={{ fontSize:10, color:t.text3 }}>SDK</span></span>],
                ['Test Plans', <span style={{ fontSize:12.5, color:t.text }}>{c.instances.length} linked</span>],
                ['Last Updated', <span style={{ fontSize:12.5, color:t.text }}>{c.updated}</span>],
              ].map(([k,v],i) => (
                <div key={i} style={ds.infoRow}><span style={ds.infoKey}>{k}</span>{v}</div>
              ))}
            </div>
            <span style={ds.label}>Tags</span>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:20 }}>
              {c.tags.map(tag => <Chip t={t} key={tag} active>{tag}</Chip>)}
            </div>
            <span style={ds.label}>PIC · People in Charge</span>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {[...new Set(c.instances.map(i=>i.pic))].map(pic => {
                const plans = c.instances.filter(i=>i.pic===pic).map(i=>i.plan);
                return (
                  <div key={pic} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:t.r, background: t.id==='bold'?t.surface2:t.bg, border:`1px solid ${t.border}` }}>
                    <Avatar t={t} pic={pic} size={28}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:t.text }}>{PEOPLE[pic]?.name || pic}</div>
                      <div style={{ fontSize:11, color:t.text3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{plans.join(' · ')}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {tab==='Steps' && (
          <div style={{ padding:'16px 18px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <span style={{ ...ds.label, marginBottom:0 }}>Test Steps · {STEPS_TC003.length}</span>
              <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:t.accent, cursor:'pointer' }}><QAIcon name="plus" size={11} color={t.accent}/>Add Step</div>
            </div>
            {STEPS_TC003.map((s, i) => (
              <div key={i} style={{ display:'flex', gap:10, padding:'10px 0', borderBottom:`1px solid ${t.borderSubtle}` }}>
                <div style={{ width:22, height:22, borderRadius:'50%', background:t.accentLight, border:`1px solid ${t.accentBorder}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:t.accentText, fontFamily:t.mono }}>{i+1}</span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, color:t.text, fontWeight:500, marginBottom:3 }}>{s.action}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <QAIcon name="check" size={11} color={t.pass}/>
                    <span style={{ fontSize:12, color:t.text2 }}>{s.expect}</span>
                  </div>
                </div>
              </div>
            ))}
            <div style={{ marginTop:16 }}>
              <span style={ds.label}>Description</span>
              <div style={{ fontSize:13, color:t.text2, lineHeight:1.6 }}>Verify that registered users can reset their password using the emailed link, and that expired tokens are rejected with a clear error.</div>
            </div>
          </div>
        )}
        {tab==='Change Log' && (
          <div style={{ padding:'16px 18px' }}>
            <span style={ds.label}>Change Log</span>
            <div style={{ position:'relative', paddingLeft:8 }}>
              {CHANGELOG_TC003.map((e, i) => (
                <div key={i} style={{ display:'flex', gap:10, paddingBottom:16, position:'relative' }}>
                  {i !== CHANGELOG_TC003.length-1 && <div style={{ position:'absolute', left:13, top:24, bottom:0, width:1, background:t.border }}/>}
                  <div style={{ zIndex:1 }}><Avatar t={t} pic={e.who} size={26}/></div>
                  <div style={{ flex:1, paddingTop:1 }}>
                    <div style={{ fontSize:12.5, color:t.text, lineHeight:1.5 }}>
                      <span style={{ fontWeight:600 }}>{PEOPLE[e.who]?.name || e.who}</span>
                      <span style={{ color:t.text2 }}> {e.action} </span>
                      {e.target && <span style={{ fontWeight:600, color: e.type==='status'?t.pass:t.text }}>{e.target}</span>}
                    </div>
                    <div style={{ fontSize:11, color:t.text3, marginTop:2 }}>{e.when}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab==='Related Plans' && (
          <div style={{ padding:'16px 18px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <span style={{ ...ds.label, marginBottom:0 }}>Related Test Plans · {c.instances.length}</span>
              <Btn t={t} variant="secondary" icon="plus" compact>Add to plan</Btn>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {c.instances.map((inst, i) => (
                <div key={i} style={{ padding:'12px 14px', borderRadius:t.r, background: t.id==='bold'?t.surface2:t.bg, border:`1px solid ${t.border}` }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                      <QAIcon name="testPlan" size={14} color={t.accent}/>
                      <span style={{ fontSize:13, fontWeight:600, color:t.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{inst.plan}</span>
                    </div>
                    <StatusBadge t={t} status={inst.status} sm/>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <Avatar t={t} pic={inst.pic} size={20}/>
                      <span style={{ fontSize:11.5, color:t.text2 }}>{PEOPLE[inst.pic]?.name}</span>
                    </div>
                    <span style={{ fontSize:11, color:t.text3 }}>{inst.updated}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Add-to-Plan modal ─────────────────────────────────────────────────────────
const MATCHES = [
  { id:'TC-006', title:'Checkout with saved payment method', plans:2 },
  { id:'TC-006·b', title:'Checkout with saved payment — EU VAT variant', plans:1, forked:true },
  { id:'TC-005', title:'Add item to cart from product detail page', plans:2 },
];

const AddToPlanModal = ({ t }) => {
  const ms = {
    overlay:{ position:'absolute', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 },
    modal:{ width:560, background:t.surface, borderRadius:t.rLg, boxShadow:t.shadowLg, border:`1px solid ${t.border}`, overflow:'hidden' },
    head:{ padding:'18px 22px', borderBottom:`1px solid ${t.border}`, display:'flex', alignItems:'flex-start', justifyContent:'space-between' },
    body:{ padding:'18px 22px' },
    label:{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:0.7, color:t.text3, fontFamily:t.mono, marginBottom:8, display:'block' },
    input:{ display:'flex', alignItems:'center', gap:8, height:40, padding:'0 12px', borderRadius:t.r, border:`1.5px solid ${t.accent}`, background: t.id==='bold'?t.surface2:t.surface, marginBottom:6 },
    foot:{ padding:'14px 22px', borderTop:`1px solid ${t.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' },
  };
  return (
    <div style={ms.overlay}>
      <div style={ms.modal}>
        <div style={ms.head}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:t.text }}>Add Test Case to Plan</div>
            <div style={{ fontSize:12.5, color:t.text2, marginTop:3 }}>Target plan: <span style={{ fontWeight:600, color:t.text }}>Checkout Flow</span></div>
          </div>
          <div style={{ width:28, height:28, borderRadius:t.rSm, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', border:`1px solid ${t.border}` }}><QAIcon name="x" size={13} color={t.text2}/></div>
        </div>
        <div style={ms.body}>
          <span style={ms.label}>Test case title</span>
          <div style={ms.input}>
            <QAIcon name="search" size={14} color={t.accent}/>
            <span style={{ fontSize:13.5, color:t.text }}>Checkout with saved</span>
            <span style={{ width:1, height:16, background:t.accent, marginLeft:1 }}/>
          </div>
          <div style={{ fontSize:11, color:t.text3, marginBottom:14 }}>Type to search existing cases, or create a brand-new one.</div>
          <span style={ms.label}>Existing matches · {MATCHES.length}</span>
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
            {MATCHES.map((m, i) => (
              <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:t.r, border:`1px solid ${i===0?t.accentBorder:t.border}`, background: i===0 ? t.accentLight : (t.id==='bold'?t.surface2:t.bg) }}>
                <QAIcon name="testCase" size={15} color={i===0?t.accent:t.text3}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:11, color:t.text3, fontFamily:t.mono }}>{m.id}</span>
                    {m.forked && <div style={{ display:'flex', alignItems:'center', gap:3 }}><QAIcon name="fork" size={9} color={t.blocked}/><span style={{ fontSize:9.5, color:t.blocked, fontFamily:t.mono }}>fork</span></div>}
                  </div>
                  <div style={{ fontSize:13, color:t.text, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.title}</div>
                </div>
                <span style={{ fontSize:10.5, color:t.text3, fontFamily:t.mono, flexShrink:0 }}>in {m.plans}</span>
                <div style={{ display:'flex', gap:5, flexShrink:0 }}>
                  <div style={{ padding:'4px 10px', borderRadius:t.rSm, border:`1px solid ${t.border}`, fontSize:11.5, fontWeight:600, color:t.text2, background:t.surface, cursor:'pointer' }}>Link</div>
                  <div style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:t.rSm, border:`1px solid ${t.blockedBorder}`, fontSize:11.5, fontWeight:600, color:t.blocked, background:t.blockedLight, cursor:'pointer' }}><QAIcon name="fork" size={11} color={t.blocked}/>Duplicate</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'10px 12px', borderRadius:t.r, background:t.warnLight, border:`1px solid ${t.warnBorder}` }}>
            <QAIcon name="info" size={14} color={t.warn} style={{ marginTop:1, flexShrink:0 }}/>
            <div style={{ fontSize:11.5, color:t.warn, lineHeight:1.5 }}>
              <strong>Link</strong> shares the same case — edits apply to every plan. <strong>Duplicate</strong> forks a new instance you can change independently.
            </div>
          </div>
        </div>
        <div style={ms.foot}>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12.5, color:t.accent, cursor:'pointer', fontWeight:600 }}><QAIcon name="plus" size={13} color={t.accent}/>Create new case instead</div>
          <div style={{ display:'flex', gap:8 }}>
            <Btn t={t} variant="secondary">Cancel</Btn>
            <Btn t={t} variant="primary">Link to Plan</Btn>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Screen ────────────────────────────────────────────────────────────────────
const TestCasesScreen = ({ t, showModal, dockOpen }) => {
  const [selId, setSelId] = React.useState('TC-003');
  const [expId, setExpId] = React.useState('TC-006');
  const selected = CASES.find(c => c.id === selId) || CASES[0];

  return (
    <AppShell t={t} active="cases" dockOpen={dockOpen}>
      <PageHeader t={t}
        title="Test Cases"
        subtitle="8 cases · 14 plan instances · Workspace: Acme Commerce"
        actions={<>
          <SearchField t={t} placeholder="Search cases…" width={200}/>
          <Chip t={t} icon="filter">Filter</Chip>
          <Chip t={t} icon="sort">Sort: Updated</Chip>
          <Btn t={t} variant="secondary" icon="upload" compact>Import</Btn>
          <Btn t={t} variant="primary" icon="plus">New Case</Btn>
        </>}
        tabs={['All Cases','Active','Draft','Archived']}
        activeTab="All Cases"
      />
      {/* Filter strip */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 24px', background: t.id==='bold'?t.surface2:t.surface, borderBottom:`1px solid ${t.border}`, flexShrink:0 }}>
        <span style={{ fontSize:11, color:t.text3, fontWeight:600, textTransform:'uppercase', letterSpacing:0.5, fontFamily:t.mono }}>Filter</span>
        {[['testPlan','Plan: All'],['runner','Status: Any'],['device','Platform: All'],['layers','Build: 2.4.1']].map(([ic,lb],i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:t.rFull, background:t.surface, border:`1px solid ${t.border}`, fontSize:12, color:t.text2, cursor:'pointer' }}>
            <QAIcon name={ic} size={11} color={t.text3}/>{lb}<QAIcon name="chevronDown" size={10} color={t.text3}/>
          </div>
        ))}
        <div style={{ marginLeft:'auto', fontSize:11.5, color:t.text3 }}>Platform &amp; build reported by the SDK · click <QAIcon name="chevronRight" size={10} color={t.text3} style={{ verticalAlign:'middle' }}/> to expand instances</div>
      </div>
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Listing */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {/* Table head */}
          <div style={{ display:'flex', alignItems:'center', height:34, borderBottom:`1px solid ${t.border}`, background: t.id==='bold'?t.bg:t.surface2, flexShrink:0, fontSize:10, fontWeight:700, color:t.text3, textTransform:'uppercase', letterSpacing:0.5, fontFamily:t.mono }}>
            <div style={{ width:TC_COLS.exp }}/>
            <div style={{ width:TC_COLS.id }}>ID</div>
            <div style={{ flex:1 }}>Title</div>
            <div style={{ width:TC_COLS.status }}>Status</div>
            <div style={{ width:TC_COLS.plans }}>Plans</div>
            <div style={{ width:TC_COLS.plat }}>Platform</div>
            <div style={{ width:TC_COLS.updated }}>Updated</div>
            <div style={{ width:TC_COLS.pic }}>PIC</div>
          </div>
          <div style={{ flex:1, overflowY:'auto', background:t.bg }}>
            {CASES.map(c => (
              <TcCaseRow key={c.id} t={t} c={c}
                selected={c.id===selId}
                expanded={c.id===expId}
                onSelect={()=>{ setSelId(c.id); }}
                onExpand={()=>setExpId(expId===c.id ? null : c.id)}
              />
            ))}
          </div>
          {/* Footer */}
          <div style={{ height:42, background:t.surface, borderTop:`1px solid ${t.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', flexShrink:0 }}>
            <span style={{ fontSize:12, color:t.text2 }}>8 cases · 14 instances</span>
            <div style={{ display:'flex', alignItems:'center', gap:14 }}>
              <span style={{ fontSize:11.5, color:t.text3 }}>1 case forked · 4 shared across plans</span>
            </div>
          </div>
        </div>
        {/* Detail */}
        <DetailPanel t={t} c={selected}/>
      </div>
      {showModal && <AddToPlanModal t={t}/>}
    </AppShell>
  );
};

Object.assign(window, { TestCasesScreen });
