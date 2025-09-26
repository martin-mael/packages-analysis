import pc from "picocolors";
import { CONFIG } from "./config.js";
import type { PackageJson } from "./types.js";

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
