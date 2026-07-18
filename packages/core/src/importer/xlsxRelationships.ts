import type JSZip from "jszip";
import { attribute, children, readRequiredXml, XlsxChartImportError } from "./xlsxXml.js";

export type Relationship = { target: string; type: string };

export async function readRelationships(
  zip: JSZip,
  path: string,
): Promise<Map<string, Relationship>> {
  const root = await readRequiredXml(zip, path);
  const relationships = new Map<string, Relationship>();
  for (const relation of children(root, "Relationship")) {
    const id = attribute(relation, "Id");
    const target = attribute(relation, "Target");
    const type = attribute(relation, "Type");
    if (id && target && type) relationships.set(id, { target, type });
  }
  return relationships;
}

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

export function resolveTarget(basePath: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const baseDirectory = basePath.slice(0, basePath.lastIndexOf("/"));
  return normalizePath(`${baseDirectory}/${target}`);
}

export function relationshipTarget(
  relationships: ReadonlyMap<string, Relationship>,
  relationId: string,
  path: string,
): Relationship {
  const relation = relationships.get(relationId);
  if (!relation) throw new XlsxChartImportError(`XLSX 关系不存在：${path} ${relationId}`);
  return relation;
}

export function relationshipPath(partPath: string): string {
  const directory = partPath.slice(0, partPath.lastIndexOf("/"));
  const fileName = partPath.slice(partPath.lastIndexOf("/") + 1);
  return `${directory}/_rels/${fileName}.rels`;
}
