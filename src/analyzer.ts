import * as clack from "@clack/prompts";
import pc from "picocolors";
import type { Config } from "./config.js";
import type { DependencyData, PackageJson } from "./types.js";
import { cleanOldCaches, loadCache, saveCache } from "./cache.js";
import { GitHubClient } from "./github-client.js";
import { analyzeOutdatedPackages } from "./analysis.js";
import { generateCsvReports, generateMarkdownReport } from "./reports.js";

export async function analyzeAllDependencies(config: Config) {
  const spinner = clack.spinner();

  try {
    spinner.start("🔧 Initialisation...");

    // Nettoyer les anciens caches
    await cleanOldCaches();

    // Vérifier si un cache existe
    spinner.message("🔍 Vérification du cache...");
    let cachedData = await loadCache(config.branch, config.repos);

    let packageJsons: Record<string, PackageJson | null> = {};
    let latestVersionsCache: Record<string, string> = {};

    if (cachedData) {
      // Utiliser les données du cache
      packageJsons = cachedData.packageJsons;
      latestVersionsCache = cachedData.latestVersions;
      spinner.message("📦 Utilisation des données en cache...");
    } else {
      // Récupérer les données depuis GitHub
      spinner.message("📦 Récupération des package.json depuis GitHub...");

      const github = new GitHubClient();

      for (const repo of config.repos) {
        const packageJson = await github.fetchPackageJson(repo, config.branch);
        packageJsons[repo] = packageJson;
      }

      // Collecter toutes les dépendances uniques pour préremplir le cache des versions
      spinner.message("🔍 Collecte des dépendances uniques...");
      const allDependencies = new Set<string>();

      Object.values(packageJsons).forEach((packageJson) => {
        if (packageJson?.dependencies) {
          Object.keys(packageJson.dependencies).forEach((dep) =>
            allDependencies.add(dep)
          );
        }
      });

      const dependenciesList = Array.from(allDependencies).sort();

      spinner.message(
        `🌐 Récupération des versions latest (${dependenciesList.length} packages)...`
      );

      // Récupérer toutes les versions latest pour le cache
      for (let i = 0; i < dependenciesList.length; i++) {
        const packageName = dependenciesList[i];
        spinner.message(
          `🌐 ${packageName} (${i + 1}/${dependenciesList.length})`
        );

        const latest = await github.getLatestVersion(packageName);
        latestVersionsCache[packageName] = latest;
      }

      // Sauvegarder dans le cache
      await saveCache(
        config.branch,
        config.repos,
        packageJsons,
        latestVersionsCache
      );
    }

    // Reconstituer le packageJsonCache à partir des données (cache ou fraîches)
    const packageJsonCache = new Map<string, PackageJson>();
    Object.entries(packageJsons).forEach(([repo, packageJson]) => {
      if (packageJson) {
        packageJsonCache.set(repo, packageJson);
      }
    });

    // Collecte de toutes les dépendances uniques
    spinner.message("🔍 Analyse des dépendances...");

    const allDependencies = new Set<string>();

    for (const packageJson of packageJsonCache.values()) {
      if (packageJson.dependencies) {
        Object.keys(packageJson.dependencies).forEach((dep) =>
          allDependencies.add(dep)
        );
      }
    }

    const dependenciesList = Array.from(allDependencies).sort();

    spinner.message(
      `📊 Traitement de ${dependenciesList.length} dépendances...`
    );

    // Analyse de chaque dépendance
    const results: DependencyData[] = [];

    for (let i = 0; i < dependenciesList.length; i++) {
      const packageName = dependenciesList[i];

      spinner.message(
        `📊 ${packageName} (${i + 1}/${dependenciesList.length})`
      );

      // Utiliser le cache des versions latest
      const latest = latestVersionsCache[packageName] || "N/A";
      const versions: Record<string, string> = {};

      // Récupération des versions pour chaque repo
      for (const repo of config.repos) {
        const packageJson = packageJsonCache.get(repo);
        if (packageJson?.dependencies?.[packageName]) {
          const version = packageJson.dependencies[packageName].replace(
            /^[\^~]/,
            ""
          );
          versions[repo] = version;
        } else {
          versions[repo] = "-";
        }
      }

      results.push({
        name: packageName,
        latest,
        versions,
      });
    }

    // Génération des CSV
    spinner.message("📝 Génération des fichiers CSV...");

    await generateCsvReports(results, config.outputFile, config.repos);

    // Analyse des retards et génération du rapport Markdown
    spinner.message("📋 Analyse des retards et génération du rapport...");

    const analysis = analyzeOutdatedPackages(results, config.repos);
    const markdownPath = await generateMarkdownReport(
      analysis,
      config.outputFile,
      config.repos
    );

    spinner.stop("✅ Analyse terminée !");

    // Générer les noms des fichiers
    const baseFilename = config.outputFile.replace(".csv", "");
    const latestFile = `${baseFilename}-latest.csv`;
    const versionsFile = `${baseFilename}-versions.csv`;

    // Affichage des résultats
    console.log("");
    console.log(
      pc.green(`📊 ${dependenciesList.length} dépendances analysées`)
    );
    console.log(pc.blue(`📄 Fichiers générés:`));
    console.log(pc.blue(`   • ${latestFile}`));
    console.log(pc.blue(`   • ${versionsFile}`));
    console.log(pc.blue(`   • ${markdownPath}`));

    // Affichage des insights
    if (analysis.outdatedPackages.length > 0) {
      console.log("");
      console.log(
        pc.red(
          `🚨 ${analysis.outdatedPackages.length} package(s) avec retard critique (≥2 versions majeures)`
        )
      );
      analysis.outdatedPackages.slice(0, 3).forEach((pkg) => {
        console.log(
          pc.red(
            `   • ${pkg.name} (${pkg.majorVersionsBehind} versions de retard)`
          )
        );
      });
    }

    if (analysis.laggingApps.length > 0) {
      console.log("");
      console.log(
        pc.yellow(
          `🐌 ${analysis.laggingApps.length} application(s) particulièrement en retard`
        )
      );
      analysis.laggingApps.slice(0, 3).forEach((app) => {
        console.log(
          pc.yellow(
            `   • ${app.displayName} (${app.outdatedPackages.length} packages obsolètes)`
          )
        );
      });
    }

    if (analysis.archivedPackages.length > 0) {
      console.log("");
      console.log(
        pc.red(
          `⚠️  ALERTE CRITIQUE: ${analysis.archivedPackages.length} package(s) archivé(s) @fulll encore utilisé(s)`
        )
      );
      analysis.archivedPackages.slice(0, 3).forEach((pkg) => {
        console.log(
          pc.red(`   • ${pkg.name} (${pkg.appsUsing.length} applications)`)
        );
      });
    }

    if (
      analysis.outdatedPackages.length === 0 &&
      analysis.laggingApps.length === 0 &&
      analysis.archivedPackages.length === 0
    ) {
      console.log("");
      console.log(
        pc.green(
          "🎉 Excellent ! Aucun retard critique ou package archivé détecté."
        )
      );
    }

    console.log("");
    console.log(pc.dim("💡 Commandes pour ouvrir les fichiers:"));
    console.log(pc.dim(`   open "${markdownPath}"`));
    console.log(pc.dim(`   open "${latestFile}"`));
    console.log(pc.dim(`   open "${versionsFile}"`));
  } catch (error) {
    spinner.stop("❌ Erreur lors de l'analyse");
    throw error;
  }
}
