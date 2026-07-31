export const AGE_CATEGORY_BUCKETS = [
  { id: 'under18', label: 'до 18', min: 1, max: 17 },
  { id: '18-24', label: '18–24', min: 18, max: 24 },
  { id: '25-34', label: '25–34', min: 25, max: 34 },
  { id: '35-44', label: '35–44', min: 35, max: 44 },
  { id: '45-54', label: '45–54', min: 45, max: 54 },
  { id: '55+', label: '55+', min: 55, max: 200 },
] as const;

export function matchesAgeCategory(age: number | null | undefined, category: string | null): boolean {
  if (!category) return true;
  const bucket = AGE_CATEGORY_BUCKETS.find(b => b.id === category);
  if (!bucket) return true;
  if (age == null || age <= 0) return false;
  return age >= bucket.min && age <= bucket.max;
}

export function matchesActivity(position: string | null | undefined, activity: string | null): boolean {
  if (!activity) return true;
  const pos = (position || '').toLowerCase();
  return pos.includes(activity.toLowerCase());
}
