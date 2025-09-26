#!/usr/bin/env bun

import { program } from "commander";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { analyzeAllDependencies } from "./analyzer.js";
import { CONFIG, type Config } from "./config.js";

program
  .name("analyze-deps")
  .description("Analyse des dépendances JavaScript/TypeScript depuis GitHub")
  .version("1.0.0")
  .option("-b, --branch <branch>", "Branche à analyser", CONFIG.defaultBranch)
  .option("-o, --output <path>", "Fichier de sortie CSV")
  .option(
    "-r, --repos <repos...>",
    "Liste des repos à analyser (séparés par des espaces)"
  )
  .option("--no-interactive", "Mode non-interactif")
  .action(async (options) => {
    console.clear();

    clack.intro(pc.bgBlue(pc.white(" 📦 Analyseur de Dépendances ")));

    try {
      let config = {
        branch: options.branch,
        outputFile: options.output,
        interactive: options.interactive !== false,
        repos: options.repos || CONFIG.defaultRepos,
      };

      if (config.interactive) {
        config = await runInteractiveMode(config);
      }

      if (!config.outputFile) {
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, -5);
        config.outputFile = `./reports/dependencies-analysis-${timestamp}.csv`;
      }

      await analyzeAllDependencies(config);

      clack.outro(pc.green("✅ Analyse terminée avec succès !"));
    } catch (error) {
      clack.cancel(pc.red(`❌ Erreur: ${(error as Error).message}`));
      process.exit(1);
    }
  });

async function runInteractiveMode(
  initialConfig: Partial<Config>
): Promise<Config> {
  const config = { ...initialConfig };

  // Sélection de la branche
  const branch = await clack.select({
    message: "Quelle branche voulez-vous analyser ?",
    initialValue: config.branch || CONFIG.defaultBranch,
    options: [
      { value: "master", label: "master", hint: "branche principale" },
      { value: "dev", label: "dev", hint: "branche de développement" },
    ],
  });

  if (clack.isCancel(branch)) {
    clack.cancel("Opération annulée");
    process.exit(0);
  }

  config.branch = branch;

  // Sélection des repos
  const customizeRepos = await clack.confirm({
    message: "Voulez-vous personnaliser la liste des repositories à analyser ?",
    initialValue: false,
  });

  if (clack.isCancel(customizeRepos)) {
    clack.cancel("Opération annulée");
    process.exit(0);
  }

  if (customizeRepos) {
    const selectedRepos = await clack.multiselect({
      message: "Sélectionnez les repositories à analyser :",
      initialValues: config.repos || [...CONFIG.defaultRepos],
      options: CONFIG.defaultRepos.map((repo) => ({
        value: repo,
        label: `${repo} (${
          CONFIG.repoDisplayNames[
            repo as keyof typeof CONFIG.repoDisplayNames
          ] || repo
        })`,
      })),
      required: true,
    });

    if (clack.isCancel(selectedRepos)) {
      clack.cancel("Opération annulée");
      process.exit(0);
    }

    config.repos = selectedRepos;
  } else {
    config.repos = config.repos || [...CONFIG.defaultRepos];
  }

  // Chemin de sortie personnalisé
  const customOutput = await clack.confirm({
    message: "Voulez-vous spécifier un chemin de sortie personnalisé ?",
    initialValue: false,
  });

  if (clack.isCancel(customOutput)) {
    clack.cancel("Opération annulée");
    process.exit(0);
  }

  if (customOutput) {
    const outputPath = await clack.text({
      message: "Chemin du fichier de sortie CSV :",
      placeholder: `./dependencies-analysis.csv`,
      validate: (value) => {
        if (!value.endsWith(".csv")) {
          return "Le fichier doit avoir une extension .csv";
        }
      },
    });

    if (clack.isCancel(outputPath)) {
      clack.cancel("Opération annulée");
      process.exit(0);
    }

    config.outputFile = outputPath;
  }

  // Confirmation
  const reposList = (config.repos || [])
    .map(
      (repo) =>
        CONFIG.repoDisplayNames[repo as keyof typeof CONFIG.repoDisplayNames] ||
        repo
    )
    .join(", ");
  const shouldContinue = await clack.confirm({
    message: `Analyser les dépendances de la branche "${config.branch}" pour ${
      (config.repos || []).length
    } repository(ies) ?
Repos: ${reposList}`,
    initialValue: true,
  });

  if (clack.isCancel(shouldContinue) || !shouldContinue) {
    clack.cancel("Opération annulée");
    process.exit(0);
  }

  return config as Config;
}

if (import.meta.main) {
  program.parse();
}

export { program };
