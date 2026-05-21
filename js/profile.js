export const PROFILE = {
  name: '',
  age: null,
  sex: '',
  height: null,
  startWeight: null,
  proteinTarget: 150,
  goal: 'health',
};

export const TARGETS = {
  inbodyScore: { current: 0, aboveAvg: 88, elite: 93 },
  bodyFatPct:  { current: 0, aboveAvg: 12, elite: 9 },
  smm:         { current: 0, aboveAvg: 38, elite: 42 },
  vfl:         { current: 0, aboveAvg: 3,  elite: 1.5 },
  phaseAngle:  { current: 0, aboveAvg: 7,  elite: 8.0 },
  bmr:         { current: 0, aboveAvg: 1850, elite: 2000 },
  proteinMass: { current: 0, aboveAvg: 13, elite: 15 },
};

export const SCAN_HISTORY = [];

export const PROGRAMME_A = {
  name: 'Programme A — Calisthenics',
  schedule: {
    1: { label: 'Push Skill + Horizontal Strength', exercises: ['Planche lean (fists/parallettes)', 'Pseudo planche push-up', 'Ring push-up', 'Dips (weighted)', 'Ring dips', 'Archer push-up'] },
    2: { label: 'Endurance Run + Muscular Endurance Circuit', exercises: ['Run', 'Push-ups x20 circuit', 'Ring rows x15', 'Air squats x20', 'Hanging leg raise x15'] },
    3: { label: 'Pull Skill + Vertical Strength', exercises: ['Front lever tuck hold', 'Muscle-up negative', 'Pull-up (weighted)', 'Chest-to-bar pull-up', 'Ring row', 'L-sit hold'] },
    4: { label: 'Rest / Active Recovery', exercises: [] },
    5: { label: 'Legs + Posterior Chain + Core', exercises: ['Pistol squat (assisted)', 'Romanian deadlift', 'Nordic curl', 'Hanging leg raise', 'Dragon flag', 'Ab wheel rollout'] },
    6: { label: 'Power + Full Body Conditioning', exercises: ['Broad jump x5', 'Explosive pull-up', 'Plyo push-up', 'Kettlebell swing', 'Burpee x10', 'Box jump'] },
    0: { label: 'Full Rest', exercises: [] },
  },
};

export const PROGRAMME_B = {
  name: 'Programme B — Power & Strength',
  schedule: {
    1: { label: 'Handstand + Overhead Strength', exercises: ['Parallette handstand hold', 'Forearm stand (Pincha)', 'Pike push-up', 'HSPU (wall-assisted)', 'Overhead press', 'Z-press'] },
    2: { label: 'Tempo Run + Core Intensive', exercises: ['Run', 'Hollow body hold', 'L-sit progression', 'Ab wheel rollout', 'Dragon flag', 'Side plank'] },
    3: { label: 'Bar Skills + Pulling Strength', exercises: ['Bar muscle-up negative', 'Back lever tuck', 'Chest-to-bar pull-up', 'Pull-up (weighted)', 'Ring row', 'Scapular pull-up'] },
    4: { label: 'Rest / Active Recovery', exercises: [] },
    5: { label: 'Pistol Squat + Hinge + Explosive Legs', exercises: ['Pistol squat progression', 'Romanian deadlift', 'Bulgarian split squat', 'Jump squat', 'Hip thrust', 'Hamstring curl'] },
    6: { label: 'Full Body Power + Endurance', exercises: ['Power clean (KB)', 'Explosive pull-up', 'Ring dips', 'Sprint intervals', 'Farmers carry', 'Burpee broad jump'] },
    0: { label: 'Full Rest', exercises: [] },
  },
};

export const MORNING_ROUTINE = [
  'Ankle CARs (30 sec each)',
  'Hip CARs (30 sec each)',
  'Shoulder CARs (30 sec each)',
  'Thoracic rotation (10 each side)',
  'Deep squat hold (60 sec)',
  'Hip flexor lunge (45 sec each)',
  'Wrist CARs — right full, left pain-free only',
];

export const SUPPLEMENTS = [
  { name: 'Probiotics 30-50B CFU', timing: 'Morning fasted', phase: 1, withFat: false },
  { name: 'Rhodiola Rosea 400mg', timing: 'Morning fasted', phase: 2, withFat: false },
  { name: 'NMN 500mg', timing: 'Morning fasted', phase: 3, withFat: false },
  { name: 'Apigenin 100mg', timing: 'Morning with NMN', phase: 3, withFat: false },
  { name: 'Vitamin D3 4000IU + K2 200mcg', timing: 'Morning with fat', phase: 1, withFat: true },
  { name: 'Tongkat Ali 400-600mg', timing: 'Morning', phase: 2, withFat: false },
  { name: 'Boron 6-10mg', timing: 'Morning', phase: 2, withFat: false },
  { name: 'Lion\'s Mane 1000mg', timing: 'Morning with food', phase: 2, withFat: false },
  { name: 'Alpha-GPC 300-600mg', timing: 'Morning or pre-training', phase: 2, withFat: false },
  { name: 'CoQ10 Ubiquinol 200mg', timing: 'Morning with fat', phase: 2, withFat: true },
  { name: 'Ginkgo Biloba 120-240mg', timing: 'Morning', phase: 2, withFat: false },
  { name: 'Shilajit 300-500mg', timing: 'Morning', phase: 2, withFat: false },
  { name: 'Resveratrol 500mg', timing: 'Morning with fat', phase: 3, withFat: true },
  { name: 'Spermidine 1-2mg', timing: 'Morning', phase: 3, withFat: false },
  { name: 'Saw Palmetto 320mg', timing: 'Morning with breakfast', phase: 1, withFat: false, hair: true },
  { name: 'Biotin 3-5mg', timing: 'Morning', phase: 1, withFat: false, hair: true },
  { name: 'Omega-3 3-4g', timing: 'With meals with fat', phase: 1, withFat: true },
  { name: 'Berberine 500mg', timing: 'With main meals', phase: 2, withFat: false },
  { name: 'Quercetin 500mg + Bromelain 250mg', timing: 'With lunch', phase: 3, withFat: false },
  { name: 'Fisetin 100-200mg', timing: 'With lunch with fat', phase: 3, withFat: true },
  { name: 'Astaxanthin 12mg', timing: 'With meal with fat', phase: 3, withFat: true },
  { name: 'Turkey Tail 1000mg', timing: 'With lunch', phase: 3, withFat: false },
  { name: 'Phosphatidylserine 300mg', timing: 'With meals with fat', phase: 2, withFat: true },
  { name: 'Magnesium Glycinate 400mg', timing: 'Before bed', phase: 1, withFat: false },
  { name: 'Zinc Bisglycinate 25-30mg', timing: 'Evening with food', phase: 1, withFat: false },
  { name: 'Ashwagandha KSM-66 600mg', timing: 'Evening with food', phase: 1, withFat: false },
  { name: 'Bacopa Monnieri 300mg', timing: 'Evening with food', phase: 2, withFat: false },
  { name: 'Reishi 1000mg', timing: 'Evening', phase: 3, withFat: false },
  { name: 'Creatine 5g', timing: 'Post-training or morning', phase: 1, withFat: false },
];

export const PRE_TRAINING = [
  'Collagen peptides 15g + Vitamin C 50mg (30-60 min BEFORE)',
  'Creatine 5g',
  'Alpha-GPC 300-600mg',
];

export const SKILL_PROGRESSIONS = {
  'Planche': ['Planche lean', 'Tuck planche', 'Advanced tuck planche', 'Straddle planche', 'Full planche'],
  'Front Lever': ['Tuck hold', 'Advanced tuck hold', 'One-leg front lever', 'Straddle front lever', 'Full front lever'],
  'Muscle-Up': ['Chest-to-bar', 'Muscle-up negative', 'Transition practice', 'Ring MU', 'Bar MU strict'],
  'L-Sit': ['Tuck L-sit', 'One-leg L-sit', 'Full L-sit', 'V-sit'],
  'Handstand': ['Wall handstand', 'Freestanding HS', 'Wall HSPU', 'Freestanding HSPU'],
  'Pistol Squat': ['Assisted high box', 'Low box pistol', 'Pistol negative', 'Full pistol', 'Weighted pistol'],
  'Back Lever': ['German hang', 'Tuck back lever', 'Advanced tuck BL', 'Full back lever'],
};

export const ALL_EXERCISES = [
  // Push
  'Planche lean (fists/parallettes)', 'Pseudo planche push-up', 'Ring push-up', 'Dips (weighted)',
  'Ring dips', 'Archer push-up', 'Pike push-up', 'HSPU (wall-assisted)', 'Overhead press',
  // Pull
  'Front lever tuck hold', 'Muscle-up negative', 'Pull-up (weighted)', 'Chest-to-bar pull-up',
  'Ring row', 'L-sit hold', 'Bar muscle-up negative', 'Back lever tuck', 'Scapular pull-up',
  'Chin-up', 'Inverted row',
  // Legs
  'Pistol squat (assisted)', 'Pistol squat', 'Romanian deadlift', 'Nordic curl',
  'Bulgarian split squat', 'Jump squat', 'Hip thrust', 'Hamstring curl', 'Box jump', 'Broad jump',
  // Handstand
  'Parallette handstand hold', 'Forearm stand (Pincha)', 'Freestanding handstand', 'Wall handstand',
  // Core
  'Hanging leg raise', 'Dragon flag', 'Ab wheel rollout', 'Hollow body hold', 'L-sit progression',
  'Side plank', 'Plank',
  // Power
  'Explosive pull-up', 'Plyo push-up', 'Kettlebell swing', 'Burpee', 'Burpee broad jump',
  'Farmers carry', 'Power clean (KB)',
  // Other
  'Z-press', 'Bench press', 'Incline press', 'Deadlift', 'Squat', 'Leg press',
];

export const MOBILITY_SESSIONS = [
  {
    day: 'Monday', label: 'Upper Body + Wrist Rehab', duration: '40-50 min',
    focus: 'Shoulders, thoracic, wrist CARs, wrist rehab',
    items: [
      'Wrist CARs — 3 × 30 sec each direction',
      'Wrist extension stretch (back of hand on floor) — 3 × 30 sec',
      'Prayer stretch (palms together, elbows out) — 3 × 30 sec',
      'Shoulder CARs — 3 × 1 full rotation each side',
      'Thoracic rotation (quadruped) — 10 reps each side',
      'Thoracic extension over foam roller — 2 min',
      'Band shoulder dislocates — 30 reps',
      'Doorway chest opener — 3 × 30 sec',
      'Overhead reach stretch — 10 reps',
    ],
  },
  {
    day: 'Tuesday', label: 'Hips + Front Splits', duration: '45-55 min',
    focus: 'Hips, hip flexors, hamstrings, front splits',
    items: [
      'Hip CARs — 3 × 1 full rotation each side',
      'Hip flexor lunge stretch — 3 × 45 sec each side',
      'Couch stretch — 3 × 45 sec each side',
      'Pigeon pose — 3 × 60 sec each side',
      'Standing hamstring stretch — 3 × 30 sec each side',
      'Half front splits — 3 × 45 sec each side',
      'Full front splits (max range) — 3 × 60 sec each side',
    ],
  },
  {
    day: 'Thursday', label: 'Full Body Deep Stretch', duration: '60-70 min',
    focus: 'Middle splits, adductors, full body',
    items: [
      'Seated wide-leg forward fold — 3 × 60 sec',
      'Adductor side lunge — 3 × 45 sec each side',
      'Frog pose — 3 × 60 sec',
      'Middle splits progression — 3 × 60 sec',
      'Hip flexor stretch — 3 × 45 sec each side',
      'Pigeon pose — 3 × 60 sec each side',
      'Thoracic rotation (quadruped) — 10 reps each side',
      'Doorway chest opener — 3 × 30 sec',
    ],
  },
  {
    day: 'Saturday', label: 'Active Flexibility', duration: '40-50 min',
    focus: 'Adductors, active flexibility, integration',
    items: [
      'Active front leg raises — 3 × 10 each side',
      'Active side leg raises — 3 × 10 each side',
      'Active pigeon lift — 3 × 10 reps each side',
      'Horse stance adductor slides — 3 × 10 reps',
      'Active split lowering — 3 × 5 reps each side',
      'Integration flow — 5 min full body',
    ],
  },
];

// Block-structured sessions from the programme documents
// type: 'warmup' | 'skill' | 'strength' | 'core' | 'cardio' | 'circuit'
export const PROG_A_SESSIONS = {
  1: {
    label: 'Push Skill + Horizontal Strength',
    focus: 'Planche · Chest · Shoulders · Triceps',
    blocks: [
      { type: 'warmup', items: [
        'Wrist circles & extensions on floor — 2 min',
        'Band shoulder dislocates — 30 reps',
        'Scapular push-ups — 15 reps',
        'Pike push-up to downward dog flow — 10 reps',
        'Hollow body hold — 3 × 20 sec',
      ]},
      { type: 'skill', name: 'Planche', note: 'Use fists/parallettes if wrist is painful', exercises: [
        { name: 'Planche lean hold', sets: 5, target: '10s', note: 'Build to 30s before progressing' },
        { name: 'Tuck planche hold', sets: 5, target: '8s' },
        { name: 'Advanced tuck planche', sets: 5, target: '6s' },
        { name: 'Straddle planche', sets: 5, target: '5s', note: 'When tuck is solid' },
      ]},
      { type: 'strength', exercises: [
        { name: 'Weighted ring push-up', sets: 4, reps: '8', note: 'Add weight when 8 reps is easy' },
        { name: 'Pike push-up (feet elevated)', sets: 3, reps: '10' },
        { name: 'Dumbbell floor press', sets: 3, reps: '10' },
        { name: 'Ring dip', sets: 3, reps: '8' },
        { name: 'Overhead dumbbell press', sets: 3, reps: '10' },
        { name: 'Tricep extension (cable or band)', sets: 3, reps: '12' },
      ]},
      { type: 'core', items: [
        'Hollow body rock — 3 × 30 sec',
        'Planche lean hold (parallettes) — 3 × 15 sec',
        'L-sit hold — 3 × 10 sec',
      ]},
    ],
  },
  2: {
    label: 'Endurance + Muscular Endurance',
    focus: 'Zone 2 cardio · Full body circuit · Mobility',
    blocks: [
      { type: 'warmup', items: [
        '5 min easy walk or light jog',
        'Leg swings — 20 each side',
        'Hip circles — 10 each side',
        'High knees — 30 sec',
      ]},
      { type: 'cardio', label: 'Zone 2 Run', target: '35-40 min', bpmTarget: '130-145', note: 'Conversational pace — nose breathing if possible' },
      { type: 'circuit', label: '3 rounds — rest 90 sec between rounds', exercises: [
        { name: 'Pull-up', reps: '8' },
        { name: 'Dip', reps: '8' },
        { name: 'Push-up', reps: '12' },
        { name: 'Air squat', reps: '15' },
        { name: 'Hanging leg raise', reps: '8' },
      ]},
      { type: 'mobility', label: 'Mobility Session 1 — Upper body, shoulders, thoracic, wrists (~45 min)' },
    ],
  },
  3: {
    label: 'Pull Skill + Vertical Strength',
    focus: 'Front Lever · Muscle-Up · Back · Biceps',
    blocks: [
      { type: 'warmup', items: [
        'Dead hang — 2 × 30 sec',
        'Scapular pull-ups — 15 reps',
        'Band pull-aparts — 30 reps',
        'Cat-cow thoracic — 10 reps',
        'Wrist CARs — 30 sec each',
      ]},
      { type: 'skill', name: 'Front Lever', exercises: [
        { name: 'Tuck front lever hold', sets: 5, target: '8s' },
        { name: 'Advanced tuck front lever', sets: 5, target: '6s' },
        { name: 'One-leg front lever', sets: 5, target: '5s' },
        { name: 'Full front lever', sets: 5, target: '3s', note: 'When tuck is solid' },
      ]},
      { type: 'skill', name: 'Muscle-Up', exercises: [
        { name: 'Muscle-up negative', sets: 5, target: '3 reps' },
        { name: 'Chest-to-bar pull-up', sets: 4, target: '5 reps' },
        { name: 'False grip ring row', sets: 3, target: '8 reps' },
      ]},
      { type: 'strength', exercises: [
        { name: 'Weighted pull-up', sets: 4, reps: '6', note: 'Strict form' },
        { name: 'Barbell row', sets: 4, reps: '8' },
        { name: 'Single-arm dumbbell row', sets: 3, reps: '10' },
        { name: 'Face pull', sets: 3, reps: '15' },
        { name: 'Hammer curl', sets: 3, reps: '10' },
        { name: 'Dead hang', sets: 2, reps: '30s', note: 'Aim for 60s per set' },
      ]},
      { type: 'core', items: [
        'L-sit hold (parallettes) — 3 × 15 sec',
        'Hanging leg raise — 3 × 10 reps',
        'Dragon flag negative — 3 × 5 reps',
      ]},
    ],
  },
  4: { label: 'Rest / Active Recovery', focus: 'Recovery', blocks: [] },
  5: {
    label: 'Legs + Posterior Chain',
    focus: 'Legs · Glutes · Hamstrings · Core',
    blocks: [
      { type: 'warmup', items: [
        'Hip CARs — 30 sec each',
        'Deep squat hold — 60 sec',
        'Glute bridge — 20 reps',
        'Leg swings — 20 each side',
        'Walking lunges — 2 × 10 each',
      ]},
      { type: 'strength', exercises: [
        { name: 'Bulgarian split squat', sets: 4, reps: '8e', note: 'Each leg' },
        { name: 'Romanian deadlift', sets: 4, reps: '8' },
        { name: 'Single-leg press', sets: 3, reps: '10e' },
        { name: 'Nordic curl', sets: 3, reps: '6' },
        { name: 'Step-up', sets: 3, reps: '10e' },
        { name: 'Calf raise', sets: 4, reps: '15e' },
      ]},
      { type: 'core', items: [
        'Pallof press — 3 × 12 each side',
        'Copenhagen plank — 3 × 20 sec each side',
        'Tibialis raise — 3 × 15 reps',
      ]},
    ],
  },
  6: {
    label: 'Power + Full Body Conditioning',
    focus: 'Explosive power · Full body',
    blocks: [
      { type: 'warmup', items: [
        'Jumping jacks — 30 sec',
        'Hip flexor lunge — 30 sec each',
        'Arm circles — 20 each',
        'Box step-ups — 10 each',
      ]},
      { type: 'strength', label: 'Power Block', exercises: [
        { name: 'Box jump', sets: 5, reps: '5', note: 'Full reset between reps' },
        { name: 'Broad jump', sets: 4, reps: '4' },
        { name: 'Explosive push-up', sets: 4, reps: '6' },
      ]},
      { type: 'cardio', label: 'Zone 2 Run (or repeat Tuesday circuit × 5)', target: '50-60 min', bpmTarget: '130-145' },
    ],
  },
  0: { label: 'Full Rest', focus: 'Recovery', blocks: [] },
};

export const PROG_B_SESSIONS = {
  1: {
    label: 'Handstand + Overhead Strength',
    focus: 'Handstand · Shoulders · Triceps',
    blocks: [
      { type: 'warmup', items: [
        'Shoulder circles — 30 each direction',
        'Wall shoulder stretch — 30 sec each',
        'Pike push-up — 10 reps',
        'Wrist CARs — 30 sec each',
        'Thoracic rotation — 10 each side',
      ]},
      { type: 'skill', name: 'Handstand', exercises: [
        { name: 'Forearm stand (Pincha)', sets: 5, target: '10s' },
        { name: 'Wall handstand hold', sets: 5, target: '20s' },
        { name: 'Freestanding handstand', sets: 5, target: '5s' },
        { name: 'Wall HSPU', sets: 4, target: '5 reps' },
      ]},
      { type: 'strength', exercises: [
        { name: 'Seated overhead press', sets: 4, reps: '8' },
        { name: 'Arnold press', sets: 3, reps: '10' },
        { name: 'Landmine press', sets: 3, reps: '10e' },
        { name: 'Lateral raise', sets: 4, reps: '15' },
        { name: 'Face pull', sets: 4, reps: '15' },
        { name: 'Tricep extension', sets: 3, reps: '12' },
      ]},
      { type: 'core', items: [
        'Hollow body hold — 4 × 25 sec',
        'Arch hold — 3 × 20 sec',
      ]},
    ],
  },
  2: {
    label: 'Tempo Run + Core Intensive',
    focus: 'Lactate threshold · Deep core',
    blocks: [
      { type: 'warmup', items: [
        '5 min easy jog',
        'Strides × 4 (10 sec each)',
        'Hip circles — 10 each side',
      ]},
      { type: 'cardio', label: 'Tempo Run', target: '20-25 min', bpmTarget: '150-165', note: 'Comfortably hard — 3-4 words at a time' },
      { type: 'circuit', label: 'Core Circuit — 4 rounds, rest 60 sec between', exercises: [
        { name: 'Ab wheel rollout', reps: '8' },
        { name: 'Toes-to-bar', reps: '10' },
        { name: 'Dragon flag negative', reps: '4' },
        { name: 'Side plank', reps: '12 sec each' },
        { name: 'V-up', reps: '12' },
      ]},
    ],
  },
  3: {
    label: 'Bar Skills + Pulling Strength',
    focus: 'Bar Muscle-Up · Back Lever · Back · Biceps',
    blocks: [
      { type: 'warmup', items: [
        'Dead hang — 2 × 30 sec',
        'Scapular pull-ups — 15 reps',
        'German hang — 3 × 5 sec',
        'Band pull-aparts — 30 reps',
      ]},
      { type: 'skill', name: 'Bar Muscle-Up', exercises: [
        { name: 'Chest-to-bar pull-up', sets: 5, target: '5 reps' },
        { name: 'Muscle-up negative', sets: 5, target: '3 reps' },
        { name: 'MU transition practice', sets: 5, target: '3 reps' },
        { name: 'Full bar muscle-up', sets: 3, target: '1-3 reps' },
      ]},
      { type: 'skill', name: 'Back Lever', exercises: [
        { name: 'German hang', sets: 3, target: '10s' },
        { name: 'Tuck back lever', sets: 4, target: '8s' },
        { name: 'Advanced tuck back lever', sets: 4, target: '6s' },
        { name: 'Full back lever', sets: 4, target: '4s', note: 'When tuck is solid' },
      ]},
      { type: 'strength', exercises: [
        { name: 'Weighted chin-up', sets: 4, reps: '6' },
        { name: 'T-bar row', sets: 4, reps: '8' },
        { name: 'Straight-arm pulldown', sets: 3, reps: '12' },
        { name: 'Incline dumbbell curl', sets: 3, reps: '10' },
        { name: 'Zottman curl', sets: 3, reps: '10' },
        { name: 'Ring row', sets: 3, reps: '10' },
      ]},
    ],
  },
  4: { label: 'Rest / Active Recovery', focus: 'Recovery', blocks: [] },
  5: {
    label: 'Pistol Squat + Hinge',
    focus: 'Pistol Squat · Deadlift · Posterior Chain',
    blocks: [
      { type: 'warmup', items: [
        'Ankle CARs — 30 sec each',
        'Hip CARs — 30 sec each',
        'Goblet squat — 10 reps',
        'Single-leg balance — 30 sec each',
        'Glute bridge — 20 reps',
      ]},
      { type: 'skill', name: 'Pistol Squat', note: 'Hold wall or use band for early levels', exercises: [
        { name: 'Assisted pistol (high box)', sets: 3, target: '5e' },
        { name: 'Low box pistol squat', sets: 3, target: '5e' },
        { name: 'Pistol negative', sets: 3, target: '5e' },
        { name: 'Full pistol squat', sets: 3, target: '5e' },
        { name: 'Weighted pistol squat', sets: 3, target: '5e', note: 'When full pistol is solid' },
      ]},
      { type: 'strength', exercises: [
        { name: 'Trap bar deadlift', sets: 4, reps: '6' },
        { name: 'Single-leg RDL', sets: 3, reps: '8e' },
        { name: 'Hip thrust', sets: 3, reps: '12' },
        { name: 'Hamstring curl', sets: 3, reps: '12' },
      ]},
    ],
  },
  6: {
    label: 'Power or Zone 2',
    focus: 'Explosive power · Conditioning',
    blocks: [
      { type: 'warmup', items: [
        'Jumping jacks — 30 sec',
        'Hip flexor lunge — 30 sec each',
        'Leg swings — 20 each side',
        'Arm circles — 20 each',
      ]},
      { type: 'strength', label: 'Power Block', exercises: [
        { name: 'Hang clean (barbell or KB)', sets: 5, reps: '3', note: 'Full reset between reps' },
        { name: 'Jump squat', sets: 4, reps: '6' },
        { name: 'Explosive ring row', sets: 4, reps: '5' },
      ]},
      { type: 'cardio', label: 'Zone 2 Run (power block OR this run)', target: '50-65 min', bpmTarget: '130-145' },
    ],
  },
  0: { label: 'Full Rest', focus: 'Recovery', blocks: [] },
};

export const DEFAULT_CHECKLIST_ITEMS = [
  { key: 'morningCARs', label: 'Morning CARs (10 min)', icon: '🌅' },
  { key: 'morningSupplements', label: 'Morning supplements', icon: '💊' },
  { key: 'preTrainingCollagen', label: 'Collagen + Vit C (30-60 min pre)', icon: '🦴' },
  { key: 'training', label: 'Training session', icon: '💪' },
  { key: 'postTrainingCreatine', label: 'Post-training creatine 5g', icon: '⚡' },
  { key: 'protein165g', label: 'Protein 165g today', icon: '🥩' },
  { key: 'wristRehab', label: 'Wrist rehab exercises', icon: '🤝' },
  { key: 'ghkCuScalp', label: 'GHK-Cu scalp (AM + PM)', icon: '💆' },
  { key: 'mobilitySession', label: 'Mobility session', icon: '🧘' },
  { key: 'eveningSupplements', label: 'Evening supplements', icon: '🌙' },
  { key: 'sleep', label: 'Sleep 7.5-9 hrs', icon: '😴' },
];
