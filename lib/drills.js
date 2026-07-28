// Drill library keyed by the issue keys produced in lib/runningAnalysis.js.
// Each drill: what to do, the cue to focus on, how much, and why it targets the issue.
const DRILLS = {
  lowCadence: [
    {
      name: 'Metronome cadence runs',
      cue: 'Run to a 175-180 bpm metronome/click track, taking quicker, lighter steps rather than reaching forward.',
      dosage: '3 x 5 min within an easy run, once or twice a week',
      why: 'Directly trains the step rate that keeps you from overstriding and braking on every foot strike.',
    },
    {
      name: 'Quick-feet ladder drills',
      cue: 'Fast, light contacts through an agility ladder (or painted lines) - minimal ground contact time.',
      dosage: '4 x 20 sec, rest 40 sec',
      why: 'Builds the neuromuscular speed needed to turn over your legs faster at any pace.',
    },
    {
      name: 'High knees',
      cue: 'Quick, tall high-knee marching/skipping, arms driving in rhythm with the legs.',
      dosage: '3 x 20 m',
      why: 'Reinforces a fast leg-cycle rhythm and upright posture that carries into your cadence.',
    },
  ],
  highVerticalOscillation: [
    {
      name: 'A-skips',
      cue: 'Skip forward driving the knee up and punching the foot down under the hip, not out in front.',
      dosage: '3 x 20 m',
      why: 'Teaches the leg to strike under the center of mass instead of launching the body upward.',
    },
    {
      name: 'Wall drill (forward lean)',
      cue: 'Lean from the ankles against a wall, drive knees up and down under the hips without bouncing.',
      dosage: '3 x 10 reps per leg',
      why: 'Trains a slight forward lean that converts vertical bounce into forward momentum.',
    },
    {
      name: 'Short hill sprints',
      cue: 'On a gentle incline, sprint 8-10 sec focusing on quick, low, "flat" steps rather than jumping up the hill.',
      dosage: '6 x 8 sec, walk down to recover',
      why: 'The incline naturally shortens ground contact and discourages excess vertical push-off.',
    },
  ],
  highGroundContactTime: [
    {
      name: 'Pogo hops (ankle stiffness)',
      cue: 'Small, quick two-footed hops using only ankle spring - minimal knee bend, minimal ground time.',
      dosage: '3 x 15-20 hops',
      why: 'Builds tendon stiffness so the foot spends less time absorbing and more time rebounding off the ground.',
    },
    {
      name: 'Single-leg pogo hops',
      cue: 'Same as pogo hops but on one leg, staying tall and quiet on landing.',
      dosage: '2 x 10 per leg',
      why: 'Adds the single-leg stability and reactive strength needed to shorten stance time while running.',
    },
    {
      name: 'Strides with a "quick off the ground" cue',
      cue: '4 x 100 m relaxed strides building to fast, thinking "light and quick," not "hard push".',
      dosage: '4-6 x 100 m',
      why: 'Rehearses efficient, short-ground-contact mechanics at faster speeds so they transfer to easy pace.',
    },
  ],
  highVerticalRatio: [
    {
      name: 'Forward lean drills',
      cue: 'From standing, lean forward from the ankles until you must step to catch yourself - that lean angle is your running posture.',
      dosage: '5 reps, hold the catch-step for 2 sec',
      why: 'Vertical ratio improves when forward speed increases relative to bounce; a slight lean redirects effort forward.',
    },
    {
      name: 'Core anti-extension work (planks, dead bugs)',
      cue: 'Keep the rib cage stacked over the pelvis - no sagging low back - for the full hold.',
      dosage: '3 x 30-45 sec plank, 3 x 10/side dead bug',
      why: 'A stable trunk stops energy leaking into vertical wobble instead of forward drive.',
    },
  ],
  gctImbalance: [
    {
      name: 'Single-leg balance reach',
      cue: 'Balance on one leg, reach the opposite hand to touch the floor in front, side, and behind without wobbling.',
      dosage: '2 x 8 reps per direction, per leg',
      why: 'Improves single-leg control, the main driver of left/right stance-time asymmetry.',
    },
    {
      name: 'Unilateral strength: split squats / step-ups',
      cue: 'Slow, controlled tempo (3 sec down), even weight distribution through the whole foot.',
      dosage: '3 x 8-10 per leg, 2x/week',
      why: 'Strength imbalances between legs are a common root cause of asymmetric ground contact time.',
    },
    {
      name: 'Get a gait check',
      cue: 'A running-store or physio video gait analysis can show whether the imbalance is mechanical (e.g. leg-length, old injury) rather than just strength.',
      dosage: 'Once, or after the imbalance persists for 4+ weeks of drill work',
      why: 'Persistent asymmetry beyond what strength/balance work fixes is worth ruling out a structural cause.',
    },
  ],
  overstriding: [
    {
      name: 'Cadence + midfoot cue combo runs',
      cue: 'Run to a 175+ bpm click track while cueing "land under my hips, midfoot" on every step.',
      dosage: '3 x 5 min segments in an easy run',
      why: 'Overstriding is a cadence-and-landing-point problem together; drilling both at once fixes it fastest.',
    },
    {
      name: 'Running tall / posture strides',
      cue: 'Strides focusing purely on running "tall" with a proud chest and slight forward lean, no reaching with the lead leg.',
      dosage: '4 x 80 m',
      why: 'Removes the reaching stride pattern that plants the foot far ahead of the hips and brakes momentum.',
    },
  ],
  general: [
    {
      name: 'A-skip / B-skip / high-knee / butt-kick circuit',
      cue: 'Classic running-drill circuit, done relaxed and rhythmic before an easy run.',
      dosage: '2 x 15-20 m each drill',
      why: 'General running-specific drills reinforce good mechanics as motor patterns, not just cues to remember mid-run.',
    },
    {
      name: 'Strides',
      cue: 'Relaxed acceleration to ~85-90% effort, holding good form, easy jog back to recover.',
      dosage: '4-6 x 100 m, twice a week',
      why: 'Strides let your nervous system rehearse efficient mechanics at speed, which then carries down into easy-pace running.',
    },
  ],
};

/** Returns a de-duplicated drill list for the given issue keys, general drills as a fallback. */
export function drillsForIssues(issueKeys) {
  const keys = issueKeys && issueKeys.length ? issueKeys : [];
  const seen = new Set();
  const result = [];
  for (const key of keys) {
    for (const drill of DRILLS[key] || []) {
      if (seen.has(drill.name)) continue;
      seen.add(drill.name);
      result.push({ ...drill, forIssue: key });
    }
  }
  if (result.length === 0) {
    for (const drill of DRILLS.general) result.push({ ...drill, forIssue: 'general' });
  }
  return result;
}

export { DRILLS };
