import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Detects whether graphify and/or code-review-graph are already installed in
// a target repo, so AGENTS.md can document them when present and stay silent
// when absent — no dangling references to tools a project doesn't use.
export function detectKnowledgeGraphs(target) {
  const read = (rel) => {
    try { return readFileSync(path.join(target, rel), 'utf8'); } catch { return null; }
  };

  const postCommit = read(path.join('.git', 'hooks', 'post-commit'));
  const preCommit = read(path.join('.git', 'hooks', 'pre-commit'));
  const mcpJson = read('.mcp.json');

  const graphify = Boolean(
    existsSync(path.join(target, 'graphify-out')) ||
    (postCommit && postCommit.includes('graphify-hook-start'))
  );

  const codeReviewGraph = Boolean(
    existsSync(path.join(target, '.code-review-graph')) ||
    (preCommit && preCommit.includes('Installed by code-review-graph')) ||
    (mcpJson && mcpJson.includes('code-review-graph'))
  );

  return { graphify, codeReviewGraph };
}

const CODE_REVIEW_GRAPH_BLOCK = `- **code-review-graph (MCP tools)** — use FIRST for anything about the code itself: how a
  function/class works, who calls what, blast radius of a change, test coverage, dead code.
  Tree-sitter-native; auto-updates on every Edit/Write via a \`PostToolUse\` hook and on commit
  via a pre-commit hook (see \`.claude/settings.json\` / \`.git/hooks/pre-commit\`) — cheapest in
  tokens for pure code questions, no manual re-sync needed.
  - \`semantic_search_nodes_tool\` / \`query_graph_tool\` instead of Grep to find code
  - \`get_impact_radius_tool\` / \`get_affected_flows_tool\` instead of manually tracing imports
  - \`detect_changes_tool\` + \`get_review_context_tool\` for reviewing a diff
  - \`get_architecture_overview_tool\` / \`list_communities_tool\` for structural overview
  - \`refactor_tool\` for rename planning / dead code
  - Prefer the packaged skills over raw tool calls when the task matches one:
    \`debug-issue\`, \`explore-codebase\`, \`refactor-safely\`, \`review-changes\`
    (\`.claude/skills/\`) — they chain the right tools in the right order.`;

function graphifyBlock(target, tier) {
  const docs = ['CONSTITUTION.md'];
  if (tier !== 'lite') docs.push('FEATURES.md');
  if (tier === 'full') docs.push('JOURNAL.md');
  if (tier !== 'lite') docs.push('archive/');
  if (existsSync(path.join(target, 'README.md'))) docs.push('the README');

  const docList = docs.length > 1
    ? `${docs.slice(0, -1).join(', ')}, and ${docs[docs.length - 1]}`
    : docs[0];

  return `- **graphify** (\`graphify query "<question>"\`, \`graphify path "<A>" "<B>"\`,
  \`graphify explain "<concept>"\`) — use for questions that span code AND docs: why a decision
  was made, what rule in \`CONSTITUTION.md\` covers a case, how an archived feature relates to
  current code. It ingested ${docList} alongside the code — code-review-graph did not.
  - Read \`graphify-out/GRAPH_REPORT.md\` only for broad architecture review, or when
    query/path/explain don't surface enough context.
  - Auto-rebuilds on \`git commit\` / \`git checkout\` via installed hooks (\`graphify hook status\`
    to check). Doc-only changes (editing ${docs.filter((d) => d !== 'the README').join(', ')})
    still need a manual \`graphify update .\`.
  - \`graphify-out/\` is gitignored (regenerable build artifact, not committed).`;
}

// Returns the full "## Knowledge graphs" section (with leading/trailing blank
// lines) when at least one tool is detected, or '' when neither is — the
// AGENTS.md.template placeholder collapses to nothing rather than leaving a
// dangling heading for tools the project doesn't have.
export function buildKnowledgeGraphsSection({ graphify, codeReviewGraph }, target, tier) {
  if (!graphify && !codeReviewGraph) return '';

  const bullets = [];
  if (codeReviewGraph) bullets.push(CODE_REVIEW_GRAPH_BLOCK);
  if (graphify) bullets.push(graphifyBlock(target, tier));

  const intro = graphify && codeReviewGraph
    ? 'Two graph tools are installed. They are scoped to different questions — don\'t use them\ninterchangeably.'
    : `${codeReviewGraph ? 'code-review-graph' : 'graphify'} is installed for token-efficient codebase exploration.`;

  const fallback = graphify && codeReviewGraph
    ? 'Fall back to Grep/Glob/Read only when neither graph covers what you need.'
    : `Fall back to Grep/Glob/Read only when ${codeReviewGraph ? 'code-review-graph' : 'graphify'} doesn't cover what you need.`;

  return `## Knowledge graphs

${intro}

${bullets.join('\n')}

${fallback}

`;
}
