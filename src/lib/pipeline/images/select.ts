export function filterPrimaryImageEntries<T extends { imageIndex: number }>(entries: T[], primaryOnly: boolean): T[] {
  if (!primaryOnly) {
    return entries;
  }

  return entries.filter((entry) => entry.imageIndex === 0);
}
