import { excelAutoFilterRefToFortune, type FilterSelection } from "@openexcel/core";
import JSZip from "jszip";
import {
  MAX_XLSX_METADATA_XML_BYTES,
  MAX_XLSX_WORKSHEET_XML_BYTES,
  MAX_XLSX_ZIP_ENTRIES,
} from "./importLimits";

const WORKBOOK_XML_PATH = "xl/workbook.xml";
const WORKBOOK_RELATIONSHIPS_PATH = "xl/_rels/workbook.xml.rels";
const WORKSHEET_RELATIONSHIP_SUFFIX = "/worksheet";

type ZipEntryWithMetadata = JSZip.JSZipObject & {
  _data?: { uncompressedSize?: unknown };
};

class XlsxMetadataLimitError extends Error {}

type WorksheetReference = {
  name: string;
  relationshipId: string;
};

function elementsWithName(document: Document, name: string): Element[] {
  return Array.from(document.getElementsByTagNameNS("*", name));
}

function attributeWithLocalName(element: Element, name: string): string | null {
  const attribute = Array.from(element.attributes).find(
    (candidate) => candidate.localName === name,
  );
  return attribute?.value ?? null;
}

function parseXml(xml: string): Document {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (elementsWithName(document, "parsererror").length > 0) {
    throw new Error("XLSX XML 无效");
  }
  return document;
}

function readStartTag(xml: string, start: number): { end: number; name: string } | undefined {
  let quote: string | undefined;
  for (let index = start + 1; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character !== ">") continue;

    const tag = xml.slice(start, index + 1);
    const name = tag.match(/^<\s*([A-Za-z_][A-Za-z0-9_.:-]*)/)?.[1];
    return name ? { end: index + 1, name } : undefined;
  }
  return undefined;
}

function readAttribute(tag: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tag.match(new RegExp(`\\s${escapedName}\\s*=\\s*(["'])(.*?)\\1`))?.[2];
}

function readAutoFilterRef(xml: string): string | undefined {
  let cursor = 0;
  while (cursor < xml.length) {
    const start = xml.indexOf("<", cursor);
    if (start < 0) return undefined;
    if (xml.startsWith("<!--", start)) {
      const endComment = xml.indexOf("-->", start + 4);
      cursor = endComment < 0 ? xml.length : endComment + 3;
      continue;
    }
    if (xml.startsWith("<?", start)) {
      const endDeclaration = xml.indexOf("?>", start + 2);
      cursor = endDeclaration < 0 ? xml.length : endDeclaration + 2;
      continue;
    }
    if (xml.startsWith("<![CDATA[", start)) {
      const endCdata = xml.indexOf("]]>", start + 9);
      cursor = endCdata < 0 ? xml.length : endCdata + 3;
      continue;
    }
    if (xml[start + 1] === "/" || xml[start + 1] === "!") {
      cursor = start + 2;
      continue;
    }

    const tag = readStartTag(xml, start);
    if (!tag) return undefined;
    const localName = tag.name.includes(":") ? tag.name.split(":").pop() : tag.name;
    if (localName === "autoFilter") {
      return readAttribute(xml.slice(start, tag.end), "ref");
    }
    cursor = tag.end;
  }
  return undefined;
}

function zipPathFromRelationship(sourcePath: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);

  const path = `${sourcePath.slice(0, sourcePath.lastIndexOf("/") + 1)}${target}`;
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

function declaredUncompressedSize(entry: JSZip.JSZipObject): number {
  const size = (entry as ZipEntryWithMetadata)._data?.uncompressedSize;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) {
    throw new XlsxMetadataLimitError("XLSX ZIP 条目大小无效");
  }
  return size;
}

function assertEntrySize(entry: JSZip.JSZipObject, limit: number, label: string): void {
  if (declaredUncompressedSize(entry) > limit) {
    throw new XlsxMetadataLimitError(`${label}超过安全限制`);
  }
}

async function readEntryText(
  zip: JSZip,
  path: string,
  limit: number,
  label: string,
  total: { bytes: number },
): Promise<string | undefined> {
  const entry = zip.file(path);
  if (!entry || entry.dir) return undefined;

  assertEntrySize(entry, limit, label);
  const size = declaredUncompressedSize(entry);
  total.bytes += size;
  if (total.bytes > MAX_XLSX_METADATA_XML_BYTES) {
    throw new XlsxMetadataLimitError("XLSX 元数据大小超过安全限制");
  }
  return entry.async("string");
}

async function readXmlEntry(
  zip: JSZip,
  path: string,
  limit: number,
  label: string,
  total: { bytes: number },
): Promise<Document | undefined> {
  const xml = await readEntryText(zip, path, limit, label, total);
  return xml == null ? undefined : parseXml(xml);
}

function readWorksheetReferences(workbook: Document): WorksheetReference[] {
  return elementsWithName(workbook, "sheet")
    .map((sheet) => ({
      name: sheet.getAttribute("name") ?? "",
      relationshipId: attributeWithLocalName(sheet, "id") ?? "",
    }))
    .filter((reference) => reference.name.length > 0 && reference.relationshipId.length > 0);
}

function readWorksheetPaths(
  relationships: Document,
  references: WorksheetReference[],
): { name: string; path: string }[] {
  const paths = new Map<string, string>();
  for (const relationship of elementsWithName(relationships, "Relationship")) {
    const type = relationship.getAttribute("Type");
    const id = relationship.getAttribute("Id");
    const target = relationship.getAttribute("Target");
    if (!type?.endsWith(WORKSHEET_RELATIONSHIP_SUFFIX) || !id || !target) continue;
    paths.set(id, zipPathFromRelationship(WORKBOOK_XML_PATH, target));
  }
  return references.flatMap((reference) => {
    const path = paths.get(reference.relationshipId);
    return path ? [{ name: reference.name, path }] : [];
  });
}

export async function extractXlsxFilterSelections(
  file: File,
): Promise<Record<string, FilterSelection>> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files);
  if (entries.length > MAX_XLSX_ZIP_ENTRIES) {
    throw new XlsxMetadataLimitError("XLSX ZIP 条目数量超过安全限制");
  }

  const total = { bytes: 0 };
  const workbook = await readXmlEntry(
    zip,
    WORKBOOK_XML_PATH,
    MAX_XLSX_METADATA_XML_BYTES,
    "XLSX 工作簿元数据",
    total,
  );
  const relationships = await readXmlEntry(
    zip,
    WORKBOOK_RELATIONSHIPS_PATH,
    MAX_XLSX_METADATA_XML_BYTES,
    "XLSX 工作簿关系元数据",
    total,
  );
  if (!workbook || !relationships) return {};

  const references = readWorksheetReferences(workbook);
  const worksheetPaths = readWorksheetPaths(relationships, references);
  const selections: Record<string, FilterSelection> = {};
  for (const { name, path } of worksheetPaths) {
    const worksheetXml = await readEntryText(
      zip,
      path,
      MAX_XLSX_WORKSHEET_XML_BYTES,
      "XLSX 工作表元数据",
      total,
    );
    if (worksheetXml == null) continue;
    const filterSelect = excelAutoFilterRefToFortune(readAutoFilterRef(worksheetXml));
    if (filterSelect) selections[name] = filterSelect;
  }
  return selections;
}
