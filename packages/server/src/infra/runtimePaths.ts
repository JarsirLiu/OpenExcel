import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serverSourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const repositoryRoot = resolve(serverSourceRoot, "../../..");
export const serverPackageRoot = resolve(repositoryRoot, "packages/server");
export const environmentFile = resolve(repositoryRoot, ".env");
export const templatesRoot = resolve(repositoryRoot, "templates");
export const webDistRoot = resolve(repositoryRoot, "packages/web/dist");
