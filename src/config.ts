export const CONFIG = {
  defaultBranch: "master",

  defaultRepos: [
    "training.web",
    "crm.web",
    "portal.web",
    "bridge-admin.web",
    "marketing.web",
    "store.web",
    "task-manager",
    "document-manager.web",
    "pdp-gateway.web",
    "messenger",
    "simulators.web",
    "pilotage",
    "taxation",
  ],

  // Mapping des repos vers des noms courts pour les en-têtes CSV
  repoDisplayNames: {
    "training.web": "Training",
    "crm.web": "CRM",
    "portal.web": "Portal",
    "bridge-admin.web": "Admin",
    "marketing.web": "Marketing",
    "store.web": "Store",
    "task-manager": "Tasks",
    "document-manager.web": "Document",
    "pdp-gateway.web": "PA",
    messenger: "Messenger",
    "simulators.web": "Simulateur",
    pilotage: "Pilotage",
    taxation: "Assistant de TVA",
  },

  // Chemin vers le package.json dans chaque repo
  repoPackageJsonPaths: {
    "training.web": "package.json",
    "crm.web": "package.json",
    "portal.web": "package.json",
    "bridge-admin.web": "package.json",
    "marketing.web": "package.json",
    "store.web": "package.json",
    "task-manager": "package.json",
    "document-manager.web": "package.json",
    "pdp-gateway.web": "package.json",
    messenger: "package.json",
    "simulators.web": "package.json",
    pilotage: "front-end/package.json",
    taxation: "front-end/package.json",
  },

  github: {
    org: "fulll",
    apiBase: "https://api.github.com",
  },

  npm: {
    registryBase: "https://registry.npmjs.org",
    githubPackagesBase: "https://npm.pkg.github.com",
  },

  output: {
    defaultCsvHeaders: ["Package", "Latest"],
  },
} as const;

export type Config = {
  branch: string;
  outputFile: string;
  interactive: boolean;
  repos: string[];
};
