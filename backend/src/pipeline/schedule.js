/**
 * Deterministic schedule allocation.
 * Harder / higher-priority material lands earlier.
 * Every must-have requirement appears via at least one of its questions.
 */
export function allocateSchedule({ questions, requirements, daysAvailable }) {
  const days = Math.max(1, Math.min(60, Number.parseInt(daysAvailable, 10) || 1));
  const mustIds = new Set((requirements || []).filter((r) => r.priority === 'must').map((r) => r.id));

  const scored = (questions || []).map((q) => {
    const coversMust = (q.requirement_ids || []).some((id) => mustIds.has(id));
    const priorityBoost = coversMust ? 10 : 0;
    const difficulty = Number(q.difficulty) || 2;
    return { ...q, _score: priorityBoost + difficulty * 3 + (coversMust ? 2 : 0) };
  });

  scored.sort((a, b) => b._score - a._score);

  const buckets = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    focus: '',
    question_ids: [],
    minutes: 0,
  }));

  // Round-robin heavy items into early days with a front-loaded bias
  for (let i = 0; i < scored.length; i++) {
    const q = scored[i];
    // Prefer earlier days: weight index 0..days-1 with more mass at front
    const bias = Math.min(days - 1, Math.floor((i * days) / Math.max(scored.length, 1)));
    const dayIndex = Math.min(bias, days - 1);
    // Fill earliest day that still has room under a soft cap, else bias day
    let target = dayIndex;
    const softCap = Math.ceil(scored.length / days) + 1;
    if (buckets[target].question_ids.length >= softCap) {
      for (let d = 0; d < days; d++) {
        if (buckets[d].question_ids.length < softCap) {
          target = d;
          break;
        }
      }
    }
    buckets[target].question_ids.push(q.id);
  }

  // Ensure every must-have has at least one scheduled question
  const scheduled = new Set(buckets.flatMap((b) => b.question_ids));
  for (const req of requirements || []) {
    if (req.priority !== 'must') continue;
    const q = scored.find((x) => (x.requirement_ids || []).includes(req.id));
    if (!q) continue;
    if (!scheduled.has(q.id)) {
      buckets[0].question_ids.unshift(q.id);
      scheduled.add(q.id);
    }
  }

  // If no questions at all, still emit empty days
  for (const b of buckets) {
    b.question_ids = [...new Set(b.question_ids)];
    const mins = b.question_ids.reduce((sum, id) => {
      const q = scored.find((x) => x.id === id);
      const d = q?.difficulty || 2;
      return sum + (d === 1 ? 20 : d === 3 ? 45 : 30);
    }, 0);
    b.minutes = Math.max(b.question_ids.length === 0 ? 15 : 0, Math.round(mins));
    if (b.question_ids.length === 0) b.minutes = days === 1 ? 30 : 15;

    const cats = b.question_ids
      .map((id) => scored.find((x) => x.id === id)?.category)
      .filter(Boolean);
    const top = mode(cats) || (b.day === 1 ? 'foundations' : 'practice');
    b.focus = focusLabel(b.day, days, top);
  }

  // Front-load minutes slightly on day 1 when many days
  if (days >= 3 && buckets[0].question_ids.length > 0) {
    buckets[0].minutes = Math.max(buckets[0].minutes, 45);
  }

  return {
    days_available: days,
    days: buckets,
  };
}

function mode(arr) {
  const counts = {};
  for (const x of arr) counts[x] = (counts[x] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function focusLabel(day, total, category) {
  if (day === 1) return `Core ${category} foundations`;
  if (day === total) return 'Light review and weak spots';
  if (day === total - 1 && total > 2) return 'Mock answers and gaps';
  const labels = {
    technical: 'Technical deep dive',
    behavioural: 'Behavioural stories',
    'system-design': 'System design practice',
    'company-fit': 'Company fit and research',
  };
  return labels[category] || `Day ${day} focus`;
}
