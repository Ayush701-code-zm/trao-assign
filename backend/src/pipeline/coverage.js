/**
 * Deterministic coverage: a requirement is covered if any question
 * lists its id in requirement_ids. Model is not asked to decide this.
 */
export function findUncoveredRequirements(requirements, questions, { mustOnly = true } = {}) {
  const covered = new Set();
  for (const q of questions || []) {
    for (const id of q.requirement_ids || []) covered.add(id);
  }

  return (requirements || [])
    .filter((r) => (mustOnly ? r.priority === 'must' : true))
    .filter((r) => !covered.has(r.id))
    .map((r) => r.id);
}

export function coverageReport(requirements, questions) {
  const uncovered = findUncoveredRequirements(requirements, questions, { mustOnly: true });
  const uncoveredNice = findUncoveredRequirements(requirements, questions, { mustOnly: false })
    .filter((id) => !uncovered.includes(id));
  return {
    uncovered_requirement_ids: uncovered,
    uncovered_nice_ids: uncoveredNice,
    covered_count: (requirements || []).filter((r) => r.priority === 'must').length - uncovered.length,
    must_count: (requirements || []).filter((r) => r.priority === 'must').length,
  };
}
