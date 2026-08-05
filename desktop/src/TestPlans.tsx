import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import type { Lifecycle, TestCase } from './TestCases';
import { t } from './tokens';

export type InstanceStatus = 'Not Run' | 'Passed' | 'Failed' | 'Blocked';

export type TestPlanItem = {
  id: string;
  test_case_id: string;
  instance_status: InstanceStatus;
  updated_at: string;
};

export type TestPlan = {
  id: string;
  workspace_id: string;
  name: string;
  notes: string;
  target_build: string;
  environment: string;
  lifecycle: Lifecycle;
  created_at: string;
  updated_at: string;
  items: TestPlanItem[];
};

type Draft = {
  id?: string;
  name: string;
  notes: string;
  target_build: string;
  environment: string;
  lifecycle: Lifecycle;
  test_case_ids: string[];
};

const BLANK: Draft = {
  name: '',
  notes: '',
  target_build: '',
  environment: '',
  lifecycle: 'Active',
  test_case_ids: [],
};

const draftOf = (plan: TestPlan): Draft => ({
  id: plan.id,
  name: plan.name,
  notes: plan.notes,
  target_build: plan.target_build,
  environment: plan.environment,
  lifecycle: plan.lifecycle,
  test_case_ids: plan.items.map((item) => item.test_case_id),
});

const inputOf = (plan: TestPlan, test_case_ids = plan.items.map((item) => item.test_case_id)) => ({
  id: plan.id,
  name: plan.name,
  notes: plan.notes,
  target_build: plan.target_build,
  environment: plan.environment,
  lifecycle: plan.lifecycle,
  test_case_ids,
});

const field = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box' as const,
  marginTop: 4,
  padding: '7px 9px',
  border: `1px solid ${t.border}`,
  borderRadius: t.rSm,
  fontFamily: t.font,
  fontSize: 13,
  color: t.text,
  background: t.surface,
};
const label = { display: 'block', fontSize: 12, color: t.text2, marginBottom: 10 };
const button = (primary = false) => ({
  height: 32,
  padding: '0 12px',
  border: primary ? 0 : `1px solid ${t.border}`,
  borderRadius: t.rSm,
  background: primary ? t.accent : t.surface,
  color: primary ? '#fff' : t.text,
  fontFamily: t.font,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
});

function PlanForm({
  draft,
  cases,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  cases: TestCase[];
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  function toggle(id: string) {
    onChange({
      ...draft,
      test_case_ids: draft.test_case_ids.includes(id)
        ? draft.test_case_ids.filter((caseId) => caseId !== id)
        : [...draft.test_case_ids, id],
    });
  }
  return (
    <form
      aria-label={draft.id ? 'Edit Test Plan' : 'New Test Plan'}
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
      style={{ padding: 16, borderBottom: `1px solid ${t.border}`, background: t.surface }}
    >
      <label style={label}>
        Name
        <input style={field} value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
      </label>
      <label style={label}>
        Plan notes
        <textarea style={{ ...field, minHeight: 58 }} value={draft.notes} onChange={(e) => onChange({ ...draft, notes: e.target.value })} />
      </label>
      <div style={{ display: 'flex', gap: 12 }}>
        <label style={{ ...label, flex: 1 }}>
          Target build
          <input style={field} value={draft.target_build} onChange={(e) => onChange({ ...draft, target_build: e.target.value })} />
        </label>
        <label style={{ ...label, flex: 1 }}>
          Environment / Server
          <input style={field} value={draft.environment} onChange={(e) => onChange({ ...draft, environment: e.target.value })} />
        </label>
        <label style={{ ...label, flex: 1 }}>
          Lifecycle
          <select style={field} value={draft.lifecycle} onChange={(e) => onChange({ ...draft, lifecycle: e.target.value as Lifecycle })}>
            <option>Active</option>
            <option>Archived</option>
          </select>
        </label>
      </div>
      <fieldset style={{ border: `1px solid ${t.border}`, borderRadius: t.rSm, margin: '0 0 12px', padding: 10 }}>
        <legend style={{ fontSize: 12, color: t.text2 }}>Included Test Cases</legend>
        {cases.length === 0 ? (
          <span style={{ fontSize: 12, color: t.text3 }}>No Test Cases are available.</span>
        ) : (
          cases.map((testCase) => (
            <label key={testCase.id} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 13, color: t.text }}>
              <input type="checkbox" checked={draft.test_case_ids.includes(testCase.id)} onChange={() => toggle(testCase.id)} />
              {testCase.title}
            </label>
          ))
        )}
      </fieldset>
      <button type="submit" style={button(true)}>Save Plan</button>{' '}
      <button type="button" onClick={onCancel} style={button()}>Cancel</button>
    </form>
  );
}

export default function TestPlans({ workspaceId }: { workspaceId: string }) {
  const [plans, setPlans] = useState<TestPlan[] | null>(null);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');

  async function reload(preferredId?: string) {
    try {
      const [listedPlans, listedCases] = await Promise.all([
        invoke<TestPlan[]>('list_test_plans', { workspaceId }),
        invoke<TestCase[]>('list_test_cases', { workspaceId }),
      ]);
      const nextPlans = listedPlans ?? [];
      setPlans(nextPlans);
      setCases(listedCases ?? []);
      setSelectedId((current) => {
        const wanted = preferredId ?? current;
        return nextPlans.some((plan) => plan.id === wanted) ? wanted : (nextPlans[0]?.id ?? '');
      });
    } catch (reason) {
      setError(String(reason));
      setPlans([]);
    }
  }

  useEffect(() => {
    reload();
  }, [workspaceId]);

  async function saveDraft() {
    if (!draft) return;
    try {
      const saved = await invoke<TestPlan>('save_test_plan', { workspaceId, input: draft });
      setDraft(null);
      setError('');
      await reload(saved.id);
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function act(command: 'archive_test_plan' | 'duplicate_test_plan', plan: TestPlan) {
    try {
      const result = await invoke<TestPlan | void>(command, { workspaceId, id: plan.id });
      setError('');
      await reload(result && 'id' in result ? result.id : plan.id);
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function removeCase(plan: TestPlan, caseId: string) {
    try {
      await invoke('save_test_plan', {
        workspaceId,
        input: inputOf(plan, plan.items.filter((item) => item.test_case_id !== caseId).map((item) => item.test_case_id)),
      });
      setError('');
      await reload(plan.id);
    } catch (reason) {
      setError(String(reason));
    }
  }

  if (plans === null) return null;
  const selected = plans.find((plan) => plan.id === selectedId);
  const caseById = new Map(cases.map((testCase) => [testCase.id, testCase]));

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', fontFamily: t.font }}>
      <aside style={{ width: 280, overflowY: 'auto', borderRight: `1px solid ${t.border}`, background: t.bg }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${t.border}`, background: t.surface }}>
          <button type="button" onClick={() => setDraft(BLANK)} style={{ ...button(true), width: '100%' }}>New Plan</button>
        </div>
        {plans.length === 0 ? (
          <p style={{ padding: 16, fontSize: 13, color: t.text2 }}>No Test Plans in this workspace yet.</p>
        ) : (
          plans.map((plan) => (
            <button
              type="button"
              key={plan.id}
              onClick={() => setSelectedId(plan.id)}
              aria-pressed={selectedId === plan.id}
              style={{ all: 'unset', boxSizing: 'border-box', display: 'block', width: '100%', padding: '12px 14px', cursor: 'pointer', borderBottom: `1px solid ${t.border}`, borderLeft: `3px solid ${selectedId === plan.id ? t.accent : 'transparent'}`, background: selectedId === plan.id ? t.accentLight : t.surface }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{plan.name}</div>
              <div style={{ marginTop: 5, fontSize: 11, color: t.text2 }}>{plan.items.length} cases · {plan.lifecycle}</div>
            </button>
          ))
        )}
      </aside>
      <section style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: t.bg }}>
        {error && <p role="alert" style={{ margin: 0, padding: '10px 16px', color: t.fail, background: t.failLight }}>{error}</p>}
        {draft ? (
          <PlanForm draft={draft} cases={cases} onChange={setDraft} onSave={saveDraft} onCancel={() => setDraft(null)} />
        ) : selected ? (
          <>
            <header style={{ padding: '18px 20px', background: t.surface, borderBottom: `1px solid ${t.border}` }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: 17, color: t.text }}>{selected.name}</h2>
                  <p style={{ margin: '5px 0 0', fontSize: 13, color: t.text2 }}>{selected.notes || 'No plan notes.'}</p>
                </div>
                <button type="button" onClick={() => act('duplicate_test_plan', selected)} style={button()}>Duplicate</button>
                <button type="button" onClick={() => setDraft(draftOf(selected))} style={button()}>Edit Plan</button>
                {selected.lifecycle === 'Active' && <button type="button" onClick={() => act('archive_test_plan', selected)} style={button()}>Archive</button>}
              </div>
              <div style={{ display: 'flex', gap: 28, marginTop: 16, fontSize: 12, color: t.text2 }}>
                <span><strong style={{ color: t.text }}>Target build:</strong> {selected.target_build || '—'}</span>
                <span><strong style={{ color: t.text }}>Environment / Server:</strong> {selected.environment || '—'}</span>
                <span><strong style={{ color: t.text }}>Lifecycle:</strong> {selected.lifecycle}</span>
              </div>
            </header>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ margin: 0, flex: 1, fontSize: 14, color: t.text }}>Included Cases ({selected.items.length})</h3>
                <button type="button" onClick={() => setDraft(draftOf(selected))} style={button()}>Add Cases</button>
              </div>
              {selected.items.length === 0 ? (
                <p style={{ fontSize: 13, color: t.text2 }}>No Test Cases in this plan.</p>
              ) : (
                selected.items.map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: t.surface, borderBottom: `1px solid ${t.borderSubtle}` }}>
                    <span style={{ flex: 1, fontSize: 13, color: t.text }}>{caseById.get(item.test_case_id)?.title ?? `Unavailable case (${item.test_case_id})`}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: t.text2 }}>{item.instance_status}</span>
                    <button type="button" aria-label={`Remove ${caseById.get(item.test_case_id)?.title ?? item.test_case_id}`} onClick={() => removeCase(selected, item.test_case_id)} style={{ ...button(), height: 27 }}>Remove</button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: t.text2, fontSize: 13 }}>Create a Test Plan to get started.</div>
        )}
      </section>
    </div>
  );
}
