// qa-test-plans.jsx — Test Plans list + editor screen

// Per-plan status counts (pass / fail / pending). Build is NOT stored here —
// it is reported by the SDK per session, not configured on the plan.
const PLANS_DATA = [
  { id:1, name:'Regression Suite v2.4', cases:24, pass:20, fail:1, pending:3, lastRun:'Today, 4:23 AM', status:'active', env:'Production', notes:'Full regression for 2.4 release.' },
  { id:2, name:'Checkout Flow', cases:8, pass:5, fail:1, pending:2, lastRun:'Yesterday', status:'active', env:'Staging', notes:'Covers cart, coupons, payments, confirmation.' },
  { id:3, name:'Authentication Suite', cases:6, pass:6, fail:0, pending:0, lastRun:'2 days ago', status:'active', env:'Staging', notes:'Login, logout, password reset, token expiry.' },
  { id:4, name:'Smoke Tests', cases:5, pass:5, fail:0, pending:0, lastRun:'3 hours ago', status:'active', env:'Production', notes:'Critical path only — run before every deploy.' },
  { id:5, name:'Search & Discovery', cases:12, pass:9, fail:1, pending:2, lastRun:'4 days ago', status:'active', env:'Staging', notes:'Search, filters, sort, empty states.' },
  { id:6, name:'Onboarding Flow', cases:9, pass:8, fail:0, pending:1, lastRun:'1 week ago', status:'archived', env:'Staging', notes:'First-run experience and account setup.' },
];

// Pass Rate = Pass ÷ (Pass + Fail + Pending). (Requested formula was Pass/(Fail+Pending);
// using the full denominator keeps the value bounded to 0–100%.)
const passRate = (p) => {
  const denom = p.pass + p.fail + p.pending;
  return denom === 0 ? 100 : Math.round((p.pass / denom) * 100);
};

const ENV_OPTIONS = ['Production', 'Staging', 'QA', 'Local'];

const PLAN_CASES = [
  { id:1, code:'TC-001', title:'User login with valid credentials', status:'pass', lastResult:'Pass' },
  { id:2, code:'TC-002', title:'Login fails with incorrect password', status:'pass', lastResult:'Pass' },
  { id:3, code:'TC-003', title:'Password reset via email link', status:'active', lastResult:'—' },
  { id:4, code:'TC-004', title:'Product search returns filtered results', status:'active', lastResult:'—' },
  { id:5, code:'TC-005', title:'Add item to cart from product detail page', status:'active', lastResult:'—' },
  { id:6, code:'TC-006', title:'Checkout with saved payment method', status:'fail', lastResult:'Fail' },
  { id:7, code:'TC-007', title:'Apply coupon code at checkout', status:'active', lastResult:'Pass' },
  { id:8, code:'TC-008', title:'Order confirmation triggers email', status:'active', lastResult:'—' },
];

const PassRateBar = ({ t, rate }) => (
  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
    <div style={{ flex:1, height:5, borderRadius:t.rFull, background: t.id==='bold' ? t.surface2 : t.border, overflow:'hidden' }}>
      <div style={{ width:`${rate}%`, height:'100%', borderRadius:t.rFull, background: rate>=90?t.pass:rate>=70?t.warn:t.fail }}/>
    </div>
    <span style={{ fontSize:11, fontWeight:700, color: rate>=90?t.pass:rate>=70?t.warn:t.fail, fontFamily:t.mono, width:30 }}>{rate}%</span>
  </div>
);

// Environment selector (looks editable — env is chosen per running session)
const EnvSelect = ({ t, value }) => (
  <div style={{ display:'inline-flex', alignItems:'center', gap:6, height:26, padding:'0 8px 0 10px', borderRadius:t.r, background: t.id==='bold'?t.surface2:t.surface, border:`1px solid ${t.border}`, cursor:'pointer' }}>
    <span style={{ width:6, height:6, borderRadius:'50%', background: value==='Production'?t.fail:value==='Staging'?t.warn:t.accent }}/>
    <span style={{ fontSize:12.5, fontWeight:600, color:t.text }}>{value}</span>
    <QAIcon name="chevronDown" size={11} color={t.text3}/>
  </div>
);

const PlanCard = ({ t, plan, selected }) => (
  <div style={{ padding:'12px 16px', borderBottom:`1px solid ${t.border}`, background: selected ? t.accentLight : 'transparent', borderLeft:`3px solid ${selected ? t.accent : 'transparent'}`, cursor:'pointer' }}>
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:6 }}>
      <div style={{ fontSize:13, fontWeight:600, color: t.text, lineHeight:1.3, flex:1, paddingRight:8 }}>{plan.name}</div>
      <Badge t={t} variant={plan.status === 'active' ? 'active' : 'default'} sm>{plan.status === 'active' ? 'Active' : 'Archived'}</Badge>
    </div>
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
      <span style={{ fontSize:11, color:t.text2, fontFamily:t.font }}>{plan.cases} cases</span>
      <span style={{ fontSize:11, color:t.text3 }}>·</span>
      <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, color:t.text2 }}>
        <span style={{ width:5, height:5, borderRadius:'50%', background: plan.env==='Production'?t.fail:plan.env==='Staging'?t.warn:t.accent }}/>{plan.env}
      </span>
    </div>
    <PassRateBar t={t} rate={passRate(plan)}/>
    <div style={{ fontSize:11, color:t.text3, marginTop:6, fontFamily:t.font }}>Last run: {plan.lastRun}</div>
  </div>
);

// ── 3-dot row menu (Edit / Add To Plan / Remove From Plan) ────────────────────
const RowActionMenu = ({ t }) => {
  const item = (icon, label, color) => (
    <div style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 12px', cursor:'pointer', fontFamily:t.font, fontSize:12.5, color: color||t.text }}>
      <QAIcon name={icon} size={14} color={color || t.text2}/>{label}
    </div>
  );
  return (
    <div style={{ position:'absolute', top:28, right:6, width:184, background:t.surface, border:`1px solid ${t.border}`, borderRadius:t.rLg, boxShadow:t.shadowLg, zIndex:40, overflow:'hidden', padding:'4px 0' }}>
      {item('edit', 'Edit case', null)}
      {item('plus', 'Add to plan…', null)}
      <div style={{ height:1, background:t.border, margin:'4px 0' }}/>
      {item('planRemove', 'Remove from plan', t.fail)}
    </div>
  );
};

const PlanCaseRow = ({ t, tc, index, menuOpen, onMenu }) => {
  const resultVariant = { pass:'pass', fail:'fail', active:'default' }[tc.status] || 'default';
  const resultLabel = { pass:'Pass', fail:'Fail', active:'—' }[tc.status] || '—';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom:`1px solid ${t.borderSubtle}`, background: tc.status==='fail' ? t.failLight : 'transparent', position:'relative' }}>
      <div style={{ width:22, height:22, borderRadius:'50%', background:t.surface2, border:`1px solid ${t.border}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <span style={{ fontSize:10, fontWeight:700, color:t.text3, fontFamily:t.mono }}>{index+1}</span>
      </div>
      <div style={{ width:60, fontSize:11, color:t.text3, fontFamily:t.mono, flexShrink:0 }}>{tc.code}</div>
      <div style={{ flex:1, fontSize:13, color:t.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{tc.title}</div>
      <Badge t={t} variant={resultVariant} sm>{resultLabel}</Badge>
      <div style={{ width:22, height:22, borderRadius:t.rSm, border:`1px solid ${menuOpen?t.accent:t.border}`, background: menuOpen?t.accentLight:'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }} onClick={onMenu}>
        <QAIcon name="more" size={12} color={menuOpen?t.accent:t.text3}/>
      </div>
      {menuOpen && <RowActionMenu t={t}/>}
    </div>
  );
};

// ── Delete confirmation dialog (broken-chain icon) ────────────────────────────
const DeletePlanDialog = ({ t, plan }) => (
  <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 }}>
    <div style={{ width:440, background:t.surface, borderRadius:t.rLg, boxShadow:t.shadowLg, border:`1px solid ${t.border}`, overflow:'hidden' }}>
      <div style={{ padding:'22px 24px 18px', textAlign:'center' }}>
        <div style={{ width:52, height:52, borderRadius:'50%', background:t.failLight, border:`1px solid ${t.failBorder}`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
          <QAIcon name="trash" size={24} color={t.fail}/>
        </div>
        <div style={{ fontSize:17, fontWeight:700, color:t.text, marginBottom:6 }}>Delete “{plan.name}”?</div>
        <div style={{ fontSize:13, color:t.text2, lineHeight:1.6 }}>
          This plan and its run history will be removed. The <strong>{plan.cases} linked cases stay in your library</strong> — they’re only unlinked from this plan.
        </div>
      </div>
      <div style={{ padding:'14px 24px', borderTop:`1px solid ${t.border}`, display:'flex', gap:10, justifyContent:'flex-end' }}>
        <Btn t={t} variant="secondary">Cancel</Btn>
        <Btn t={t} variant="danger" icon="trash">Delete Plan</Btn>
      </div>
    </div>
  </div>
);

// ── Empty state (no plan selected) ────────────────────────────────────────────
const PlansEmptyState = ({ t }) => (
  <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, background:t.bg }}>
    <div style={{ width:64, height:64, borderRadius:t.rLg, background: t.id==='bold'?t.surface2:t.surface, border:`1px solid ${t.border}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <QAIcon name="testPlan" size={28} color={t.text3}/>
    </div>
    <div style={{ textAlign:'center' }}>
      <div style={{ fontSize:15, fontWeight:600, color:t.text, marginBottom:4 }}>No plan selected</div>
      <div style={{ fontSize:13, color:t.text2, maxWidth:320, lineHeight:1.5 }}>Choose a test plan from the list to see its cases, pass rate, and recent sessions.</div>
    </div>
    <div style={{ marginTop:4 }}><Btn t={t} variant="primary" icon="plus">New Plan</Btn></div>
  </div>
);

const TestPlansScreen = ({ t, noSelection, showDelete }) => {
  const [menuRow, setMenuRow] = React.useState(showDelete ? null : 6);
  const selectedPlan = PLANS_DATA[0];
  const rate = passRate(selectedPlan);
  const planStyles = {
    body: { flex:1, display:'flex', overflow:'hidden' },
    leftList: { width:300, borderRight:`1px solid ${t.border}`, display:'flex', flexDirection:'column', flexShrink:0, overflow:'hidden' },
    listHeader: { padding:'10px 16px', borderBottom:`1px solid ${t.border}`, background:t.surface, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 },
    listScroll: { flex:1, overflowY:'auto', background:t.bg },
    mainArea: { flex:1, display:'flex', flexDirection:'column', overflow:'hidden' },
    planHeader: { background:t.surface, borderBottom:`1px solid ${t.border}`, padding:'16px 24px', flexShrink:0 },
    planContent: { flex:1, display:'flex', overflow:'hidden' },
    casesPanel: { flex:1, display:'flex', flexDirection:'column', overflow:'hidden' },
    casesHeader: { padding:'10px 16px', borderBottom:`1px solid ${t.border}`, background:t.surface, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 },
    casesList: { flex:1, overflowY:'auto', background:t.bg },
    sideInfo: { width:260, borderLeft:`1px solid ${t.border}`, background:t.surface, padding:'16px', flexShrink:0, overflowY:'auto' },
    infoSection: { marginBottom:20 },
    infoLabel: { fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:0.7, color:t.text3, fontFamily:t.mono, marginBottom:6, display:'block' },
    infoValue: { fontSize:13, color:t.text, fontFamily:t.font },
    divider: { height:1, background:t.border, margin:'12px 0' },
  };
  return (
    <AppShell t={t} active="plans">
      <PageHeader t={t}
        title="Test Plans"
        subtitle={`${PLANS_DATA.length} plans · Workspace: Acme Commerce`}
        actions={<>
          <SearchField t={t} placeholder="Search plans…" width={180}/>
          <Btn t={t} variant="primary" icon="plus">New Plan</Btn>
        </>}
        tabs={['All Plans','Active','Archived']}
        activeTab="All Plans"
      />
      <div style={planStyles.body}>
        {/* Left: plan list */}
        <div style={planStyles.leftList}>
          <div style={planStyles.listHeader}>
            <span style={{ fontSize:12, fontWeight:600, color:t.text2 }}>6 Plans</span>
            <div style={{ display:'flex', gap:4 }}>
              <Chip t={t} active sm>All</Chip>
              <Chip t={t} sm>Active</Chip>
            </div>
          </div>
          <div style={planStyles.listScroll}>
            {PLANS_DATA.map(plan => <PlanCard key={plan.id} t={t} plan={plan} selected={!noSelection && plan.id === selectedPlan.id}/>)}
          </div>
        </div>
        {/* Main area */}
        {noSelection ? <PlansEmptyState t={t}/> : (
        <div style={planStyles.mainArea}>
          {/* Plan header */}
          <div style={planStyles.planHeader}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:t.text, marginBottom:3 }}>{selectedPlan.name}</div>
                <div style={{ fontSize:13, color:t.text2 }}>{selectedPlan.notes}</div>
              </div>
              <div style={{ display:'flex', gap:8, flexShrink:0, alignItems:'center' }}>
                {/* Delete — broken-chain icon with hover tooltip */}
                <div style={{ position:'relative' }} className="qa-tip">
                  <div style={{ width:32, height:32, borderRadius:t.r, border:`1px solid ${t.failBorder}`, background:t.failLight, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                    <QAIcon name="trash" size={15} color={t.fail}/>
                  </div>
                  <div className="qa-tip-bubble" style={{ position:'absolute', top:38, right:0, whiteSpace:'nowrap', background:t.id==='bold'?'#000':'#111827', color:'#fff', fontSize:11, fontWeight:500, padding:'5px 9px', borderRadius:t.rSm, boxShadow:t.shadowMd, pointerEvents:'none', zIndex:20 }}>
                    Delete plan — unlinks all {selectedPlan.cases} cases
                  </div>
                </div>
                <Btn t={t} variant="secondary" icon="copy" compact>Duplicate</Btn>
                <Btn t={t} variant="secondary" icon="edit" compact>Edit Plan</Btn>
                <Btn t={t} variant="primary" icon="runner">Run Plan</Btn>
              </div>
            </div>
            <div style={{ display:'flex', gap:24, alignItems:'flex-end' }}>
              {[
                { label:'Cases', value: selectedPlan.cases },
                { label:'Pass Rate', value:`${rate}%`, color: rate>=90?t.pass:rate>=70?t.warn:t.fail },
                { label:'Last Run', value: selectedPlan.lastRun },
              ].map(stat => (
                <div key={stat.label} style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:0.6, color:t.text3, fontFamily:t.mono }}>{stat.label}</span>
                  <span style={{ fontSize:14, fontWeight:600, color: stat.color || t.text, fontFamily:t.font }}>{stat.value}</span>
                </div>
              ))}
              {/* Environment — selectable (the env the session runs against) */}
              <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                <span style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:0.6, color:t.text3, fontFamily:t.mono }}>Environment</span>
                <EnvSelect t={t} value={selectedPlan.env}/>
              </div>
            </div>
          </div>
          {/* Cases */}
          <div style={planStyles.planContent}>
            <div style={planStyles.casesPanel}>
              <div style={planStyles.casesHeader}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:t.text }}>Included Cases</span>
                  <Badge t={t} variant="default" sm>{PLAN_CASES.length}</Badge>
                  <Badge t={t} variant="pass" sm dot>2 Pass</Badge>
                  <Badge t={t} variant="fail" sm dot>1 Fail</Badge>
                </div>
                <Btn t={t} variant="secondary" icon="plus" compact>Add Cases</Btn>
              </div>
              <div style={{ display:'flex', alignItems:'center', height:32, padding:'0 16px', borderBottom:`1px solid ${t.border}`, background: t.id==='bold' ? t.surface2 : t.surface, flexShrink:0 }}>
                {['#','Code','Test Case Title','Last Result',''].map((h,i) => (
                  <div key={i} style={{ fontSize:10, fontWeight:700, color:t.text3, textTransform:'uppercase', letterSpacing:0.5, fontFamily:t.mono, ...(i===0?{width:42}:i===1?{width:70}:i===2?{flex:1}:i===3?{width:70}:{width:30}) }}>{h}</div>
                ))}
              </div>
              <div style={planStyles.casesList}>
                {PLAN_CASES.map((tc, i) => <PlanCaseRow key={tc.id} t={t} tc={tc} index={i} menuOpen={menuRow===tc.id} onMenu={()=>setMenuRow(menuRow===tc.id?null:tc.id)}/>)}
              </div>
            </div>
            {/* Side info */}
            <div style={planStyles.sideInfo}>
              <div style={planStyles.infoSection}>
                <span style={planStyles.infoLabel}>Plan Details</span>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:12, color:t.text2 }}>Status</span>
                    <Badge t={t} variant="active" sm>Active</Badge>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:12, color:t.text2 }}>Environment</span>
                    <EnvSelect t={t} value={selectedPlan.env}/>
                  </div>
                </div>
              </div>
              <div style={planStyles.divider}/>
              <div style={planStyles.infoSection}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ ...planStyles.infoLabel, marginBottom:0 }}>Pass Rate</span>
                  <span style={{ fontSize:10, color:t.text3, fontFamily:t.mono }} title="Pass ÷ (Pass + Fail + Pending)">Pass ÷ total</span>
                </div>
                <PassRateBar t={t} rate={rate}/>
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
                  <div style={{ fontSize:11, color:t.pass }}>✓ {selectedPlan.pass} Pass</div>
                  <div style={{ fontSize:11, color:t.fail }}>✗ {selectedPlan.fail} Fail</div>
                  <div style={{ fontSize:11, color:t.text3 }}>— {selectedPlan.pending} Pending</div>
                </div>
              </div>
              <div style={planStyles.divider}/>
              <div style={planStyles.infoSection}>
                <span style={planStyles.infoLabel}>Recent Sessions</span>
                {['Today 4:23 AM','Yesterday 2:10 PM','Jun 5, 11:40 AM'].map((s, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:`1px solid ${t.borderSubtle}` }}>
                    <span style={{ fontSize:12, color:t.text2 }}>{s}</span>
                    <Badge t={t} variant={i===1?'fail':'pass'} sm>{i===1?'Fail':'Pass'}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
      {showDelete && <DeletePlanDialog t={t} plan={selectedPlan}/>}
    </AppShell>
  );
};

Object.assign(window, { TestPlansScreen });
