// Fonction pour extraire le numéro de version majeure
export function getMajorVersion(version: string): number {
  const cleaned = version.replace(/^[\^~]/, "").trim();
  if (cleaned === "-" || cleaned === "N/A") return 0;
  const match = cleaned.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// Fonction pour comparer les versions et calculer l'écart
export function getVersionGap(
  currentVersion: string,
  latestVersion: string
): number {
  const current = getMajorVersion(currentVersion);
  const latest = getMajorVersion(latestVersion);
  return Math.max(0, latest - current);
}
