import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import Papa from "papaparse";
import { CONFIG } from "./config.js";
import type { DependencyData, AnalysisResult } from "./types.js";

// Génération des rapports CSV
export async function generateCsvReports(
  results: DependencyData[],
  outputPath: string,
  repos: string[]
) {
  // Créer le répertoire de sortie si nécessaire
  await mkdir(dirname(outputPath), { recursive: true });

  const baseFilename = outputPath.replace(".csv", "");
  const latestFile = `${baseFilename}-latest.csv`;
  const versionsFile = `${baseFilename}-versions.csv`;

  // === FICHIER 1: Versions Latest ===
  const latestData = results.map((result) => ({
    Package: result.name,
    Latest: result.latest,
  }));

  const latestCsv = Papa.unparse(latestData, {
    columns: ["Package", "Latest"],
    header: true,
  });

  // Ajouter le BOM UTF-8 pour Excel
  const latestCsvWithBom = "\uFEFF" + latestCsv;
  await writeFile(latestFile, latestCsvWithBom, "utf8");

  // === FICHIER 2: Versions par Repo ===
  // Générer les en-têtes dynamiquement
  const versionHeaders = ["Package"];
  repos.forEach((repo) => {
    const displayName =
      CONFIG.repoDisplayNames[repo as keyof typeof CONFIG.repoDisplayNames] ||
      repo;
    versionHeaders.push(displayName);
  });

  // Préparer les données pour le CSV des versions
  const versionData = results.map((result) => {
    const row: Record<string, string> = {
      Package: result.name,
    };

    repos.forEach((repo) => {
      const displayName =
        CONFIG.repoDisplayNames[repo as keyof typeof CONFIG.repoDisplayNames] ||
        repo;
      row[displayName] = result.versions[repo] || "-";
    });

    return row;
  });

  // Générer le CSV des versions
  const versionsCsv = Papa.unparse(versionData, {
    columns: versionHeaders,
    header: true,
  });

  // Ajouter le BOM UTF-8 pour Excel
  const versionsCsvWithBom = "\uFEFF" + versionsCsv;
  await writeFile(versionsFile, versionsCsvWithBom, "utf8");
}

// Génération du rapport Markdown
export async function generateMarkdownReport(
  analysis: AnalysisResult,
  outputPath: string,
  repos: string[]
): Promise<string> {
  const timestamp = new Date().toISOString().split("T")[0];
  const repoList = repos
    .map(
      (repo) =>
        CONFIG.repoDisplayNames[repo as keyof typeof CONFIG.repoDisplayNames] ||
        repo
    )
    .join(", ");

  let markdown = `# 📊 Rapport d'Analyse des Dépendances

**Date :** ${timestamp}  
**Repositories analysés :** ${repoList}

---

## 🚨 Packages en Retard Critique (≥2 versions majeures)

`;

  if (analysis.outdatedPackages.length === 0) {
    markdown += `✅ **Excellent !** Aucun package n'a un retard critique (≥2 versions majeures).

`;
  } else {
    markdown += `🚨 **${analysis.outdatedPackages.length} package(s) avec retard critique détecté(s)**

<details>
<summary>Voir les détails des packages en retard critique</summary>

`;

    analysis.outdatedPackages.forEach((pkg) => {
      markdown += `### 📦 \`${pkg.name}\`
- **Version latest :** \`${pkg.latest}\`
- **Retard maximum :** ${pkg.majorVersionsBehind} version(s) majeure(s)
- **Applications concernées :**
`;

      pkg.appsUsingOldVersions
        .sort((a, b) => b.versionsBehind - a.versionsBehind)
        .forEach((app) => {
          const displayName =
            CONFIG.repoDisplayNames[
              app.repo as keyof typeof CONFIG.repoDisplayNames
            ] || app.repo;
          const badge =
            app.versionsBehind >= 3
              ? "🔴"
              : app.versionsBehind >= 2
              ? "🟠"
              : "🟡";
          markdown += `  - ${badge} **${displayName}** : \`${app.version}\` (${app.versionsBehind} versions de retard)\n`;
        });

      markdown += "\n";
    });

    markdown += `</details>

`;
  }

  markdown += `---

## 🏢 Focus Packages Fulll (@fulll/*)

`;

  // Analyser les packages @fulll spécifiquement
  const fulllPackages = analysis.outdatedPackages.filter((pkg) =>
    pkg.name.startsWith("@fulll/")
  );

  if (fulllPackages.length === 0) {
    // Vérifier s'il y a des packages @fulll dans l'analyse générale
    // (pas forcément en retard critique)
    const allFulllPackages = []; // Cette information devrait venir du contexte principal
    markdown += `✅ **Excellent !** Aucun package @fulll n'a de retard critique.

*Note : Cette analyse se concentre sur les packages internes Fulll (@fulll/*)*

`;
  } else {
    markdown += `📊 **${fulllPackages.length} package(s) interne(s) Fulll avec retard critique**

<details>
<summary>Voir les détails des packages @fulll en retard</summary>

`;

    fulllPackages.forEach((pkg) => {
      markdown += `### 🏢 \`${pkg.name}\`
- **Version latest :** \`${pkg.latest}\`
- **Retard :** ${pkg.majorVersionsBehind} version(s) majeure(s)
- **Impact :** ${pkg.appsUsingOldVersions.length} application(s) concernée(s)
- **Applications utilisant des versions obsolètes :**
`;

      pkg.appsUsingOldVersions
        .sort((a, b) => b.versionsBehind - a.versionsBehind)
        .forEach((app) => {
          const displayName =
            CONFIG.repoDisplayNames[
              app.repo as keyof typeof CONFIG.repoDisplayNames
            ] || app.repo;
          const badge =
            app.versionsBehind >= 3
              ? "🔴"
              : app.versionsBehind >= 2
              ? "🟠"
              : "🟡";
          markdown += `  - ${badge} **${displayName}** : \`${app.version}\` (${app.versionsBehind} versions de retard)\n`;
        });

      markdown += `
**🚨 Action recommandée :** Coordonner la mise à jour de ce package interne avec l'équipe de développement.

`;
    });

    markdown += `</details>

`;
  }

  markdown += `---

## ⚠️ Packages Archivés @fulll - Alerte Critique

`;

  if (analysis.archivedPackages.length === 0) {
    markdown += `✅ **Excellent !** Aucun package @fulll archivé n'est utilisé dans les applications.

*Ces packages sont archivés et ne doivent plus être utilisés dans de nouveaux développements.*

`;
  } else {
    markdown += `🚨 **ALERTE CRITIQUE** : ${analysis.archivedPackages.length} package(s) archivé(s) encore utilisé(s) !

*Les packages suivants sont **archivés** et ne devraient plus être utilisés. Il est fortement recommandé de les migrer vers des alternatives.*

<details>
<summary>Voir la liste des packages archivés encore utilisés</summary>

`;

    analysis.archivedPackages.forEach((pkg) => {
      markdown += `### 📦 \`${pkg.name}\` ❌ ARCHIVÉ
- **Statut :** 🚨 Package archivé - Migration recommandée
- **Applications utilisant encore ce package :** ${pkg.appsUsing.length}

**Applications concernées :**
`;

      pkg.appsUsing.forEach((app) => {
        markdown += `  - 🏢 **${app.displayName}** : \`${app.version}\`\n`;
      });

      markdown += `
**🚨 Action urgente :** Planifier la migration de ce package archivé vers une alternative moderne.

`;
    });

    markdown += `</details>

`;
  }

  markdown += `---

## 🐌 Applications Particulièrement en Retard

`;

  if (analysis.laggingApps.length === 0) {
    markdown += `✅ **Bien joué !** Aucune application n'a un retard significatif (≥5 packages obsolètes).

`;
  } else {
    markdown += `🐌 **${analysis.laggingApps.length} application(s) particulièrement en retard**

<details>
<summary>Voir les détails des applications en retard</summary>

`;

    analysis.laggingApps.forEach((app) => {
      const criticalCount = app.outdatedPackages.filter(
        (pkg) => pkg.versionsBehind >= 2
      ).length;
      const warningCount = app.outdatedPackages.filter(
        (pkg) => pkg.versionsBehind === 1
      ).length;

      markdown += `### 🏢 ${app.displayName}
- **Total packages obsolètes :** ${app.outdatedPackages.length}
- **Critiques (≥2 versions) :** ${criticalCount} 🔴
- **À surveiller (1 version) :** ${warningCount} 🟡

<details>
<summary>Voir les packages à mettre à jour pour ${app.displayName}</summary>

`;

      app.outdatedPackages.forEach((pkg) => {
        const badge =
          pkg.versionsBehind >= 3
            ? "🔴"
            : pkg.versionsBehind >= 2
            ? "🟠"
            : "🟡";
        markdown += `- ${badge} \`${pkg.name}\` : \`${pkg.currentVersion}\` → \`${pkg.latestVersion}\` (${pkg.versionsBehind} versions)\n`;
      });

      markdown += `
</details>

`;
    });

    markdown += `</details>

`;
  }

  markdown += `---

## 📈 Recommandations

### 🎯 Actions Prioritaires
`;

  if (analysis.outdatedPackages.length > 0) {
    markdown += `1. **Packages critiques à mettre à jour immédiatement :**
`;
    analysis.outdatedPackages.slice(0, 5).forEach((pkg) => {
      const isFulll = pkg.name.startsWith("@fulll/");
      const icon = isFulll ? "🏢" : "📦";
      const note = isFulll ? " (package interne)" : "";
      markdown += `   - ${icon} \`${pkg.name}\` (${pkg.majorVersionsBehind} versions de retard)${note}\n`;
    });
  }

  if (analysis.laggingApps.length > 0) {
    markdown += `
2. **Applications nécessitant une attention particulière :**
`;
    analysis.laggingApps.slice(0, 3).forEach((app) => {
      markdown += `   - **${app.displayName}** (${app.outdatedPackages.length} packages obsolètes)\n`;
    });
  }

  if (analysis.archivedPackages.length > 0) {
    const priorityNumber =
      (analysis.outdatedPackages.length > 0 ? 1 : 0) +
      (analysis.laggingApps.length > 0 ? 1 : 0) +
      1;
    markdown += `
${priorityNumber}. **🚨 URGENT - Packages archivés à migrer :**
`;
    analysis.archivedPackages.slice(0, 5).forEach((pkg) => {
      markdown += `   - ❌ \`${pkg.name}\` (utilisé par ${pkg.appsUsing.length} applications)\n`;
    });

    if (analysis.archivedPackages.length > 5) {
      markdown += `   - ... et ${
        analysis.archivedPackages.length - 5
      } autres packages archivés\n`;
    }
  }

  markdown += `

---

*Rapport généré automatiquement le ${new Date().toLocaleString("fr-FR")}*
`;

  // Écrire le fichier Markdown
  const markdownPath = outputPath.replace(".csv", ".md");
  await writeFile(markdownPath, markdown, "utf8");

  return markdownPath;
}
