// MAX_STORAGE_PER_ORG_MB: what one account may keep stored (models + covers).
// Unset or not a positive number: unlimited (self-hosting). pocket3d.co sets it
export function storageLimitBytes(): number | null {
  const mb = Number(process.env.MAX_STORAGE_PER_ORG_MB);
  return Number.isFinite(mb) && mb > 0 ? Math.floor(mb * 1024 * 1024) : null;
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}
