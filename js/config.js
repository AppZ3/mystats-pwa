// Shared helpers: load user settings with profile.js defaults as fallback
import { dbGet } from './db.js';
import { MORNING_ROUTINE, SUPPLEMENTS, PROGRAMME_A, PROGRAMME_B, TARGETS, PROFILE, DEFAULT_CHECKLIST_ITEMS } from './profile.js';

export async function getChecklistItems() {
  const s = await dbGet('settings', 'checklist_items');
  return s?.value ?? DEFAULT_CHECKLIST_ITEMS;
}

export async function getMorningRoutine() {
  const s = await dbGet('settings', 'morning_routine');
  return s?.value ?? MORNING_ROUTINE;
}

export async function getSupplements() {
  const s = await dbGet('settings', 'supplements');
  return s?.value ?? SUPPLEMENTS;
}

export async function getProgrammeSchedule(prog) {
  const s = await dbGet('settings', `programme_${prog.toLowerCase()}_schedule`);
  return s?.value ?? (prog === 'A' ? PROGRAMME_A.schedule : PROGRAMME_B.schedule);
}

export async function getTargets() {
  const s = await dbGet('settings', 'targets');
  return s?.value ?? TARGETS;
}

export async function getUserProfile() {
  const s = await dbGet('settings', 'user_profile');
  return s?.value ?? PROFILE;
}
