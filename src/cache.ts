import { readFile, writeFile, mkdir, stat, readdir, unlink } from "fs/promises";
import { join } from "path";
import pc from "picocolors";
import type { CacheData, PackageJson } from "./types.js";

const CACHE_DIR = "./.deps-cache";
const CACHE_DURATION_HOURS = 24;

// Fonction pour obtenir le nom du fichier de cache basé sur la config
function getCacheFilename(branch: string, repos: string[]): string {
  const repoHash = repos
    .sort()
    .join("-")
    .replace(/[^a-zA-Z0-9-]/g, "");
  const today = new Date().toISOString().split("T")[0];
  return `cache-${branch}-${repoHash}-${today}.json`;
}

// Fonction pour nettoyer les anciens caches
export async function cleanOldCaches(): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const files = await readdir(CACHE_DIR);
    const now = new Date();

    for (const file of files) {
      if (!file.startsWith("cache-") || !file.endsWith(".json")) continue;

      try {
        const filePath = join(CACHE_DIR, file);
        const stats = await stat(filePath);
        const ageHours =
          (now.getTime() - stats.mtime.getTime()) / (1000 * 60 * 60);

        if (ageHours > CACHE_DURATION_HOURS) {
          await unlink(filePath);
          console.log(pc.dim(`🗑️  Cache expiré supprimé: ${file}`));
        }
      } catch (error) {
        // Ignorer les erreurs de fichiers individuels
      }
    }
  } catch (error) {
    // Si le répertoire n'existe pas encore, l'ignorer
  }
}

// Fonction pour charger le cache
export async function loadCache(
  branch: string,
  repos: string[]
): Promise<CacheData | null> {
  try {
    const filename = getCacheFilename(branch, repos);
    const cachePath = join(CACHE_DIR, filename);

    const cacheContent = await readFile(cachePath, "utf8");
    const cache: CacheData = JSON.parse(cacheContent);

    // Vérifier que le cache est valide (moins de 24h)
    const cacheTime = new Date(cache.timestamp);
    const now = new Date();
    const ageHours = (now.getTime() - cacheTime.getTime()) / (1000 * 60 * 60);

    if (ageHours > CACHE_DURATION_HOURS) {
      console.log(pc.yellow("⏰ Cache expiré, récupération des données..."));
      return null;
    }

    console.log(
      pc.green(`✅ Cache trouvé et valide (${Math.round(ageHours * 10) / 10}h)`)
    );
    return cache;
  } catch (error) {
    // Cache non trouvé ou invalide
    return null;
  }
}

// Fonction pour sauvegarder le cache
export async function saveCache(
  branch: string,
  repos: string[],
  packageJsons: Record<string, PackageJson | null>,
  latestVersions: Record<string, string>
): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });

    const cache: CacheData = {
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split("T")[0],
      packageJsons,
      latestVersions,
    };

    const filename = getCacheFilename(branch, repos);
    const cachePath = join(CACHE_DIR, filename);

    await writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
    console.log(pc.green(`💾 Données mises en cache: ${filename}`));
  } catch (error) {
    console.warn(
      pc.yellow(
        `⚠️  Impossible de sauvegarder le cache: ${(error as Error).message}`
      )
    );
  }
}
