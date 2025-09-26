import { CONFIG } from "./config.js";
import { getVersionGap } from "./version-utils.js";
import type { DependencyData, AnalysisResult } from "./types.js";

// Fonction pour analyser les retards
export function analyzeOutdatedPackages(
  results: DependencyData[],
  repos: string[]
): AnalysisResult {
  const outdatedPackages = [];
  const appOutdatedData: Record<
    string,
    { repo: string; displayName: string; outdated: any[] }
  > = {};

  // Initialiser les données des apps
  repos.forEach((repo) => {
    const displayName =
      CONFIG.repoDisplayNames[repo as keyof typeof CONFIG.repoDisplayNames] ||
      repo;
    appOutdatedData[repo] = {
      repo,
      displayName,
      outdated: [],
    };
  });

  for (const result of results) {
    const appsUsingOldVersions: {
      repo: string;
      version: string;
      versionsBehind: number;
    }[] = [];
    let maxVersionsBehind = 0;

    // Analyser chaque repo pour ce package
    repos.forEach((repo) => {
      const currentVersion = result.versions[repo];
      if (!currentVersion || currentVersion === "-") return;

      const versionsBehind = getVersionGap(currentVersion, result.latest);

      if (versionsBehind > 0) {
        appsUsingOldVersions.push({
          repo,
          version: currentVersion,
          versionsBehind,
        });

        // Ajouter aux données de l'app
        appOutdatedData[repo].outdated.push({
          name: result.name,
          currentVersion,
          latestVersion: result.latest,
          versionsBehind,
        });

        maxVersionsBehind = Math.max(maxVersionsBehind, versionsBehind);
      }
    });

    // Considérer comme en retard si au moins 2 versions majeures de retard
    if (maxVersionsBehind >= 2) {
      outdatedPackages.push({
        name: result.name,
        latest: result.latest,
        majorVersionsBehind: maxVersionsBehind,
        appsUsingOldVersions,
      });
    }
  }

  // Trier les packages par retard (les plus en retard d'abord)
  outdatedPackages.sort(
    (a, b) => b.majorVersionsBehind - a.majorVersionsBehind
  );

  // Construire la liste des apps en retard (au moins 5 packages avec retard >= 1)
  const laggingApps = Object.values(appOutdatedData)
    .filter((app) => app.outdated.length >= 5)
    .map((app) => ({
      repo: app.repo,
      displayName: app.displayName,
      outdatedPackages: app.outdated.sort(
        (a, b) => b.versionsBehind - a.versionsBehind
      ),
    }))
    .sort((a, b) => b.outdatedPackages.length - a.outdatedPackages.length);

  // Analyser les packages archivés @fulll
  const archivedPackages: {
    name: string;
    appsUsing: { repo: string; displayName: string; version: string }[];
  }[] = [];

  CONFIG.archivedPackages.forEach((packageName) => {
    const fullPackageName = `@fulll/${packageName}`;
    const packageData = results.find((r) => r.name === fullPackageName);

    if (packageData) {
      const appsUsing: {
        repo: string;
        displayName: string;
        version: string;
      }[] = [];

      repos.forEach((repo) => {
        const version = packageData.versions[repo];
        if (version && version !== "-") {
          const displayName =
            CONFIG.repoDisplayNames[
              repo as keyof typeof CONFIG.repoDisplayNames
            ] || repo;
          appsUsing.push({
            repo,
            displayName,
            version,
          });
        }
      });

      if (appsUsing.length > 0) {
        archivedPackages.push({
          name: fullPackageName,
          appsUsing,
        });
      }
    }
  });

  // Trier par nombre d'applications utilisant le package (les plus utilisés d'abord)
  archivedPackages.sort((a, b) => b.appsUsing.length - a.appsUsing.length);

  return {
    outdatedPackages,
    laggingApps,
    archivedPackages,
  };
}
