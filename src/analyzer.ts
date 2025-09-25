import * as clack from "@clack/prompts";
import pc from "picocolors";
import Papa from "papaparse";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { CONFIG, type Config } from "./config.js";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface DependencyData {
  name: string;
  latest: string;
  versions: Record<string, string>;
}

export class GitHubClient {
  private token: string | null = null;
  private tokenLoaded: boolean = false;

  constructor() {
    // Le token sera chargé de manière asynchrone lors de la première utilisation
  }

  private async loadNpmToken() {
    if (this.tokenLoaded) return;

    try {
      const npmrcPath = `${process.env.HOME}/.npmrc`;
      const file = Bun.file(npmrcPath);
      const npmrcContent = await file.text();
      const tokenMatch = npmrcContent.match(
        /\/\/npm\.pkg\.github\.com\/:_authToken=(.+)/
      );

      if (tokenMatch) {
        this.token = tokenMatch[1].trim();
        console.log(pc.green("✅ Token npm trouvé et chargé"));
      } else {
        console.warn(pc.yellow("⚠️  Token npm non trouvé dans ~/.npmrc"));
      }
    } catch (error) {
      console.warn(
        pc.yellow(
          `⚠️  Impossible de lire ~/.npmrc: ${(error as Error).message}`
        )
      );
    }

    this.tokenLoaded = true;
  }

  async fetchPackageJson(
    repo: string,
    branch: string
  ): Promise<PackageJson | null> {
    await this.loadNpmToken();

    if (!this.token) {
      throw new Error("Token npm non trouvé dans ~/.npmrc");
    }

    try {
      // Utiliser le chemin configuré pour le package.json
      const packageJsonPath =
        CONFIG.repoPackageJsonPaths[
          repo as keyof typeof CONFIG.repoPackageJsonPaths
        ] || "package.json";
      const url = `${CONFIG.github.apiBase}/repos/${CONFIG.github.org}/${repo}/contents/${packageJsonPath}?ref=${branch}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!response.ok) {
        // Essayer avec la branche alternative
        const alternativeBranch = branch === "master" ? "main" : "master";
        const alternativeUrl = `${CONFIG.github.apiBase}/repos/${CONFIG.github.org}/${repo}/contents/${packageJsonPath}?ref=${alternativeBranch}`;

        const alternativeResponse = await fetch(alternativeUrl, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });

        if (!alternativeResponse.ok) {
          console.warn(
            pc.yellow(`⚠️  Impossible de récupérer ${repo}/${packageJsonPath}`)
          );
          return null;
        }

        const alternativeData = await alternativeResponse.json();
        const content = atob(alternativeData.content);
        return JSON.parse(content);
      }

      const data = await response.json();
      const content = atob(data.content);
      return JSON.parse(content);
    } catch (error) {
      console.warn(
        pc.yellow(
          `⚠️  Erreur lors de la récupération de ${repo}: ${
            (error as Error).message
          }`
        )
      );
      return null;
    }
  }

  async getLatestVersion(packageName: string): Promise<string> {
    await this.loadNpmToken();

    try {
      if (packageName.startsWith("@fulll/")) {
        // Package GitHub privé
        if (!this.token) return "N/A";

        const packagePath = packageName.replace("@fulll/", "");
        const url = `${CONFIG.github.apiBase}/orgs/fulll/packages/npm/${packagePath}/versions`;

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });

        if (response.ok) {
          const versions = await response.json();
          if (versions.length > 0) {
            return versions[0].name.replace(/^v/, "");
          }
        }

        // Fallback avec npm view si disponible
        try {
          const proc = Bun.spawn(["npm", "view", packageName, "version"], {
            stdout: "pipe",
            stderr: "pipe",
          });

          const output = await new Response(proc.stdout).text();
          return output.trim() || "N/A";
        } catch {
          return "N/A";
        }
      } else {
        // Package npm public
        const url = `${CONFIG.npm.registryBase}/${packageName}/latest`;
        const response = await fetch(url);

        if (response.ok) {
          const data = await response.json();
          return data.version || "N/A";
        }

        return "N/A";
      }
    } catch (error) {
      return "N/A";
    }
  }
}

export async function analyzeAllDependencies(config: Config) {
  const spinner = clack.spinner();

  try {
    spinner.start("🔧 Initialisation...");

    const github = new GitHubClient();
    const packageJsonCache = new Map<string, PackageJson>();

    // Récupération de tous les package.json
    spinner.message("📦 Récupération des package.json depuis GitHub...");

    for (const repo of config.repos) {
      const packageJson = await github.fetchPackageJson(repo, config.branch);
      if (packageJson) {
        packageJsonCache.set(repo, packageJson);
      }
    }

    // Collecte de toutes les dépendances uniques
    spinner.message("🔍 Collecte des dépendances uniques...");

    const allDependencies = new Set<string>();

    for (const packageJson of packageJsonCache.values()) {
      if (packageJson.dependencies) {
        Object.keys(packageJson.dependencies).forEach((dep) =>
          allDependencies.add(dep)
        );
      }
    }

    const dependenciesList = Array.from(allDependencies).sort();

    spinner.message(`📊 Analyse de ${dependenciesList.length} dépendances...`);

    // Analyse de chaque dépendance
    const results: DependencyData[] = [];

    for (let i = 0; i < dependenciesList.length; i++) {
      const packageName = dependenciesList[i];

      spinner.message(
        `📊 Analyse de ${packageName} (${i + 1}/${dependenciesList.length})`
      );

      const latest = await github.getLatestVersion(packageName);
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

    spinner.stop("✅ Analyse terminée !");

    // Générer les noms des deux fichiers
    const baseFilename = config.outputFile.replace(".csv", "");
    const latestFile = `${baseFilename}-latest.csv`;
    const versionsFile = `${baseFilename}-versions.csv`;

    // Affichage des résultats
    console.log("");
    console.log(
      pc.green(`📊 ${dependenciesList.length} dépendances analysées`)
    );
    console.log(pc.blue(`📄 Fichiers CSV générés:`));
    console.log(pc.blue(`   • ${latestFile}`));
    console.log(pc.blue(`   • ${versionsFile}`));
    console.log("");
    console.log(pc.dim("💡 Commandes pour ouvrir les fichiers:"));
    console.log(pc.dim(`   open "${latestFile}"`));
    console.log(pc.dim(`   open "${versionsFile}"`));
    console.log(pc.dim(`   open -a "Microsoft Excel" "${latestFile}"`));
    console.log(pc.dim(`   open -a "Microsoft Excel" "${versionsFile}"`));
  } catch (error) {
    spinner.stop("❌ Erreur lors de l'analyse");
    throw error;
  }
}

async function generateCsvReports(
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
