export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface CacheData {
  timestamp: string;
  date: string;
  packageJsons: Record<string, PackageJson | null>;
  latestVersions: Record<string, string>;
}

export interface DependencyData {
  name: string;
  latest: string;
  versions: Record<string, string>;
}

export interface AnalysisResult {
  outdatedPackages: {
    name: string;
    latest: string;
    majorVersionsBehind: number;
    appsUsingOldVersions: {
      repo: string;
      version: string;
      versionsBehind: number;
    }[];
  }[];
  laggingApps: {
    repo: string;
    displayName: string;
    outdatedPackages: {
      name: string;
      currentVersion: string;
      latestVersion: string;
      versionsBehind: number;
    }[];
  }[];
  archivedPackages: {
    name: string;
    appsUsing: {
      repo: string;
      displayName: string;
      version: string;
    }[];
  }[];
}
