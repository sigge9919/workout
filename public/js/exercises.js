// Exercise database for the 15-minute daily coach.
// This app is the "third pillar" alongside running + gym: mobility, injury
// prevention, core stability and flexibility. Intensity is deliberately kept
// low (controlled tempo, no plyometrics/jumping) so it never adds meaningful
// fatigue on top of running or lifting days.
//
// region tags are used for fatigue-avoidance substitution: if the user marks
// "legs fatigued", any exercise tagged region:'legs' with a `sub` is swapped
// for its substitute (usually an upper-body or seated-flexibility move).

export const EXERCISES = {
  // ---- Breath / warm-up ----
  breath_box: {
    id: 'breath_box', name: 'Box Breathing', category: 'warmup', region: 'full',
    work: 30, sides: 1,
    cue: 'Inhale 4, hold 4, exhale 4, hold 4. Settle in and set your intention.',
  },
  cat_cow: {
    id: 'cat_cow', name: 'Cat-Cow Flow', category: 'warmup', region: 'spine',
    work: 40, sides: 1,
    cue: 'On hands and knees, arch and round your spine slowly with your breath.',
  },
  arm_circles: {
    id: 'arm_circles', name: 'Arm Circles', category: 'warmup', region: 'shoulders',
    work: 30, sides: 1,
    cue: 'Big slow circles, both directions. Loosen the shoulders.',
  },
  leg_swings: {
    id: 'leg_swings', name: 'Leg Swings', category: 'warmup', region: 'legs',
    work: 40, sides: 2,
    cue: 'Hold a wall, swing one leg forward-back, then side to side.',
    sub: 'ankle_circles',
  },
  march_in_place: {
    id: 'march_in_place', name: 'Easy March in Place', category: 'warmup', region: 'legs',
    work: 40, sides: 1,
    cue: 'Gentle marching, knees to hip height, arms relaxed.',
    sub: 'seated_breath_reach',
  },

  // ---- Hip & ankle mobility (running prehab) ----
  hip_circles: {
    id: 'hip_circles', name: '90/90 Hip Switches', category: 'mobility', region: 'legs',
    work: 45, sides: 1,
    cue: 'Sit on the floor, rotate knees side to side keeping shins on the ground.',
    sub: 'seated_hip_stretch',
  },
  ankle_circles: {
    id: 'ankle_circles', name: 'Ankle Circles', category: 'mobility', region: 'ankles',
    work: 40, sides: 2,
    cue: 'Lift one foot, big slow circles each direction. Runner\'s ankle prep.',
  },
  world_greatest_stretch: {
    id: 'world_greatest_stretch', name: "World's Greatest Stretch", category: 'mobility', region: 'legs',
    work: 50, sides: 2,
    cue: 'Deep lunge, hand to floor, rotate the other arm up to the sky.',
    sub: 'seated_hip_stretch',
  },
  hip_flexor_lunge_stretch: {
    id: 'hip_flexor_lunge_stretch', name: 'Kneeling Hip Flexor Stretch', category: 'flexibility', region: 'legs',
    work: 40, sides: 2,
    cue: 'Half-kneel, tuck pelvis under, gentle push forward until you feel the front of the hip.',
  },
  standing_quad_stretch: {
    id: 'standing_quad_stretch', name: 'Standing Quad Stretch', category: 'flexibility', region: 'legs',
    work: 35, sides: 2,
    cue: 'Hold your foot behind you, knees together, tuck the pelvis slightly.',
    sub: 'seated_hip_stretch',
  },
  calf_stretch_wall: {
    id: 'calf_stretch_wall', name: 'Wall Calf Stretch', category: 'flexibility', region: 'legs',
    work: 35, sides: 2,
    cue: 'Back leg straight, heel down, lean into the wall until the calf stretches.',
    sub: 'ankle_circles',
  },

  // ---- Balance & single-leg stability (injury prevention) ----
  single_leg_balance: {
    id: 'single_leg_balance', name: 'Single-Leg Balance Reach', category: 'balance', region: 'legs',
    work: 40, sides: 2,
    cue: 'Stand on one leg, tap the other foot out front, side, and back. Stay tall.',
    sub: 'seated_figure4_stretch',
  },
  clamshells: {
    id: 'clamshells', name: 'Clamshells', category: 'strength', region: 'legs',
    work: 40, sides: 2,
    cue: 'Lie on your side, knees bent, open the top knee like a clamshell. Slow control.',
    sub: 'seated_figure4_stretch',
  },
  glute_bridge: {
    id: 'glute_bridge', name: 'Glute Bridge Hold', category: 'strength', region: 'legs',
    work: 45, sides: 1,
    cue: 'Lie on your back, knees bent, lift hips, squeeze glutes, hold steady.',
    sub: 'supine_knee_hug',
  },
  monster_walk: {
    id: 'monster_walk', name: 'Band-Free Monster Walk', category: 'strength', region: 'legs',
    work: 40, sides: 1,
    cue: 'Small squat stance, step side to side keeping tension in the hips.',
    sub: 'seated_figure4_stretch',
  },

  // ---- Upper body & shoulder / thoracic mobility ----
  wall_slides: {
    id: 'wall_slides', name: 'Wall Slides', category: 'mobility', region: 'shoulders',
    work: 40, sides: 1,
    cue: 'Back flat on a wall, arms in a goalpost shape, slide up and down keeping contact.',
  },
  thread_the_needle: {
    id: 'thread_the_needle', name: 'Thread the Needle', category: 'mobility', region: 'spine',
    work: 45, sides: 2,
    cue: 'On hands and knees, thread one arm under the other, rotate through the upper back.',
  },
  scapular_pushup: {
    id: 'scapular_pushup', name: 'Scapular Push-ups', category: 'strength', region: 'upper',
    work: 40, sides: 1,
    cue: 'Plank or knee-plank, keep arms straight, pinch and spread the shoulder blades.',
  },
  incline_pushup: {
    id: 'incline_pushup', name: 'Incline Push-ups (slow tempo)', category: 'strength', region: 'upper',
    work: 40, sides: 1,
    cue: 'Hands on a counter or bench, 3 seconds down, 1 up. Controlled, not maximal.',
  },
  band_pull_apart: {
    id: 'band_pull_apart', name: 'Towel/Band Pull-Aparts', category: 'strength', region: 'upper',
    work: 40, sides: 1,
    cue: 'Hold a towel or band, arms straight, pull apart squeezing shoulder blades together.',
  },
  doorway_chest_stretch: {
    id: 'doorway_chest_stretch', name: 'Doorway Chest Stretch', category: 'flexibility', region: 'shoulders',
    work: 35, sides: 2,
    cue: 'Forearm on a doorframe, step through gently until you feel the chest open.',
  },
  childs_pose_reach: {
    id: 'childs_pose_reach', name: "Child's Pose Side Reach", category: 'flexibility', region: 'spine',
    work: 40, sides: 2,
    cue: "Sit hips to heels, walk hands over to one side for a side-body stretch.",
  },

  // ---- Core & anti-rotation ----
  dead_bug: {
    id: 'dead_bug', name: 'Dead Bug', category: 'core', region: 'core',
    work: 45, sides: 1,
    cue: 'On your back, extend opposite arm and leg slowly, keep low back pressed down.',
  },
  bird_dog: {
    id: 'bird_dog', name: 'Bird Dog', category: 'core', region: 'core',
    work: 45, sides: 1,
    cue: 'Hands and knees, extend opposite arm and leg, hold steady, no rocking.',
  },
  side_plank: {
    id: 'side_plank', name: 'Side Plank (knees or feet)', category: 'core', region: 'core',
    work: 30, sides: 2,
    cue: 'Stack shoulder over elbow, lift hips, keep a straight line.',
  },
  plank_hold: {
    id: 'plank_hold', name: 'Plank Hold', category: 'core', region: 'core',
    work: 40, sides: 1,
    cue: 'Forearms down, straight line from head to heels, brace the core gently.',
  },
  pallof_press: {
    id: 'pallof_press', name: 'Standing Anti-Rotation Press', category: 'core', region: 'core',
    work: 40, sides: 2,
    cue: 'Hold hands at chest, press straight out and back, resist twisting.',
  },

  // ---- Seated / low-fatigue substitutes ----
  seated_breath_reach: {
    id: 'seated_breath_reach', name: 'Seated Reach & Breathe', category: 'flexibility', region: 'full',
    work: 40, sides: 1,
    cue: 'Sit tall, reach arms overhead on the inhale, fold gently forward on the exhale.',
  },
  seated_hip_stretch: {
    id: 'seated_hip_stretch', name: 'Seated Figure-4 Stretch', category: 'flexibility', region: 'legs',
    work: 40, sides: 2,
    cue: 'Ankle over opposite knee, hinge forward gently. Legs stay relaxed - just a stretch.',
  },
  seated_figure4_stretch: {
    id: 'seated_figure4_stretch', name: 'Reclined Figure-4 Stretch', category: 'flexibility', region: 'legs',
    work: 40, sides: 2,
    cue: 'Lie back, ankle over knee, pull the uncrossed thigh toward your chest gently.',
  },
  supine_knee_hug: {
    id: 'supine_knee_hug', name: 'Supine Knee Hug', category: 'flexibility', region: 'legs',
    work: 35, sides: 2,
    cue: 'Lying down, hug one knee to your chest gently, keep the other leg relaxed.',
  },

  // ---- Deep stretch / recovery (longer holds, passive) ----
  seated_forward_fold: {
    id: 'seated_forward_fold', name: 'Seated Forward Fold', category: 'flexibility', region: 'legs',
    work: 50, sides: 1,
    cue: 'Legs extended, hinge from the hips, let your back round softly. No bouncing.',
  },
  butterfly_stretch: {
    id: 'butterfly_stretch', name: 'Butterfly Stretch', category: 'flexibility', region: 'legs',
    work: 50, sides: 1,
    cue: 'Soles of feet together, let knees fall open, gentle forward lean.',
  },
  spinal_twist: {
    id: 'spinal_twist', name: 'Seated Spinal Twist', category: 'flexibility', region: 'spine',
    work: 40, sides: 2,
    cue: 'Sit tall, twist toward the back leg, use your arm gently for extra rotation.',
  },
  neck_stretch: {
    id: 'neck_stretch', name: 'Neck Side Stretch', category: 'flexibility', region: 'shoulders',
    work: 30, sides: 2,
    cue: 'Ear toward shoulder, light hand pressure only. Keep the other shoulder relaxed down.',
  },
  legs_up_wall: {
    id: 'legs_up_wall', name: 'Legs Up the Wall', category: 'flexibility', region: 'full',
    work: 120, sides: 1,
    cue: 'Lie back, legs resting up a wall, close your eyes, breathe slowly. Pure recovery.',
  },
  final_breath: {
    id: 'final_breath', name: 'Closing Breath', category: 'warmup', region: 'full',
    work: 30, sides: 1,
    cue: 'A few slow breaths to close the session. Notice how your body feels.',
  },
};

function ex(id) { return EXERCISES[id]; }

// 7-day rotation. Each day totals roughly 13-15 minutes including rest gaps
// added by the timer engine, so the whole session always stays under 15 min.
export const WEEK_PROGRAM = [
  { // 0 Sunday - Deep Stretch & Recovery
    theme: 'Deep Stretch & Recovery',
    subtitle: 'Long passive holds. Full recovery day - go easy.',
    blocks: [ex('breath_box'), ex('seated_forward_fold'), ex('butterfly_stretch'), ex('seated_hip_stretch'), ex('supine_knee_hug'), ex('spinal_twist'), ex('neck_stretch'), ex('legs_up_wall'), ex('final_breath')],
  },
  { // 1 Monday - Hip & Ankle Mobility (running prehab)
    theme: 'Hip & Ankle Mobility',
    subtitle: 'Running prehab - keeps hips and ankles healthy for the miles.',
    blocks: [ex('cat_cow'), ex('leg_swings'), ex('ankle_circles'), ex('hip_circles'), ex('world_greatest_stretch'), ex('hip_flexor_lunge_stretch'), ex('calf_stretch_wall'), ex('final_breath')],
  },
  { // 2 Tuesday - Upper Body & Core Stability
    theme: 'Upper Body & Core Stability',
    subtitle: 'Light strength that complements the gym without adding fatigue.',
    blocks: [ex('arm_circles'), ex('scapular_pushup'), ex('incline_pushup'), ex('band_pull_apart'), ex('dead_bug'), ex('bird_dog'), ex('pallof_press'), ex('doorway_chest_stretch'), ex('final_breath')],
  },
  { // 3 Wednesday - Full-Body Flexibility Flow
    theme: 'Full-Body Flexibility Flow',
    subtitle: 'Post-run style recovery stretch, head to toe.',
    blocks: [ex('breath_box'), ex('cat_cow'), ex('world_greatest_stretch'), ex('standing_quad_stretch'), ex('calf_stretch_wall'), ex('childs_pose_reach'), ex('spinal_twist'), ex('final_breath')],
  },
  { // 4 Thursday - Balance & Single-Leg Stability
    theme: 'Balance & Single-Leg Stability',
    subtitle: 'Injury-prevention for runners: ankles, knees, hips.',
    blocks: [ex('march_in_place'), ex('ankle_circles'), ex('single_leg_balance'), ex('clamshells'), ex('glute_bridge'), ex('monster_walk'), ex('calf_stretch_wall'), ex('seated_hip_stretch'), ex('final_breath')],
  },
  { // 5 Friday - Shoulder & Thoracic Mobility
    theme: 'Shoulder & Thoracic Mobility',
    subtitle: 'Undoes desk posture and supports your lifting technique.',
    blocks: [ex('arm_circles'), ex('cat_cow'), ex('wall_slides'), ex('thread_the_needle'), ex('scapular_pushup'), ex('doorway_chest_stretch'), ex('childs_pose_reach'), ex('neck_stretch'), ex('final_breath')],
  },
  { // 6 Saturday - Core & Anti-Rotation Strength
    theme: 'Core & Anti-Rotation Strength',
    subtitle: 'Light, controlled core work - stability, not fatigue.',
    blocks: [ex('breath_box'), ex('dead_bug'), ex('bird_dog'), ex('side_plank'), ex('plank_hold'), ex('pallof_press'), ex('seated_breath_reach'), ex('final_breath')],
  },
];
