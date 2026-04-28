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
  { day: 'Monday', label: 'Upper Body + Wrist Rehab', duration: '40-50 min', focus: 'Shoulders, thoracic, wrist CARs, wrist rehab' },
  { day: 'Tuesday', label: 'Hips + Front Splits', duration: '45-55 min', focus: 'Hips, hip flexors, hamstrings, front splits' },
  { day: 'Thursday', label: 'Full Body Deep Stretch', duration: '60-70 min', focus: 'Middle splits, adductors, full body' },
  { day: 'Saturday', label: 'Active Flexibility', duration: '40-50 min', focus: 'Adductors, active flexibility, integration' },
];

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
