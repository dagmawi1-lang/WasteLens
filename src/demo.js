export const DEMO_STEPS = [
  { id: 'scan', title: 'Show an item scan', detail: 'Use a real item photo or camera capture. State clearly whether the active model is general MobileNet or a custom trained model.' },
  { id: 'verify', title: 'Demonstrate human verification', detail: 'Confirm or correct the suggested disposal category and explain why model predictions are not treated as final decisions.' },
  { id: 'guide', title: 'Show local source-backed guidance', detail: 'Open the Custom Local Profile and show a rule with its source URL and date checked. Explain that the user entered and reviewed the source.' },
  { id: 'contamination', title: 'Run the contamination check', detail: 'Enter observations about residue, liquid, grease, and mixed materials. Explain that these are user-reported, not camera detections.' },
  { id: 'dataset', title: 'Explain the dataset workflow', detail: 'Show consent-based collection, object/session group IDs, and the leakage-aware split. Do not imply that the model has trained unless you have run it.' },
  { id: 'evaluation', title: 'Explain evaluation and field testing', detail: 'Show test metrics and field feedback only if real reports exist. State the test-set size and limitations; never present sample placeholders as results.' },
  { id: 'privacy', title: 'Explain privacy and sync', detail: 'Show that photos stay in the local dataset and are excluded from account sync. Mention that cloud sync is self-hosted and not deployed by this repository.' },
  { id: 'next', title: 'Close with measurable next steps', detail: 'Describe collecting more independently labeled items, testing across real conditions, and validating local rules with official providers.' }
]

export function getDemoProgress(completed = []) {
  const valid = new Set(DEMO_STEPS.map(step => step.id))
  const count = new Set(completed.filter(id => valid.has(id))).size
  return { completed: count, total: DEMO_STEPS.length, percent: Math.round(count / DEMO_STEPS.length * 100) }
}
