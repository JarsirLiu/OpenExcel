import { DOMParser, type Element, type Node } from "@xmldom/xmldom";
import type JSZip from "jszip";

export type XmlNode = {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
};

export class XlsxChartImportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    if (options?.cause !== undefined) {
      Object.defineProperty(this, "cause", { configurable: true, value: options.cause });
    }
    this.name = "XlsxChartImportError";
  }
}

export function localName(name: string): string {
  const separator = name.indexOf(":");
  return separator >= 0 ? name.slice(separator + 1) : name;
}

function parseXml(xml: string, path: string): XmlNode {
  let parserError: Error | undefined;
  try {
    const document = new DOMParser({
      onError: (level, message) => {
        if (level === "error" || level === "fatalError") parserError = new Error(message);
      },
    }).parseFromString(xml, "application/xml");
    const documentElement = document.documentElement;
    if (!documentElement) throw new XlsxChartImportError(`XLSX XML 为空：${path}`);

    const convert = (element: Element): XmlNode => {
      const attributes: Record<string, string> = {};
      for (let index = 0; index < element.attributes.length; index += 1) {
        const item = element.attributes.item(index);
        if (item) attributes[item.name] = item.value;
      }
      const children: XmlNode[] = [];
      let text = "";
      for (let node: Node | null = element.firstChild; node; node = node.nextSibling) {
        if (node.nodeType === 1) children.push(convert(node as Element));
        else if (node.nodeType === 3 || node.nodeType === 4) text += node.nodeValue ?? "";
      }
      return { name: element.nodeName, attributes, children, text };
    };

    if (parserError) throw parserError;
    return convert(documentElement);
  } catch (error) {
    throw new XlsxChartImportError(`无法解析 XLSX XML：${path}`, { cause: error });
  }
}

export function children(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((child) => localName(child.name) === name);
}

export function child(node: XmlNode, name: string): XmlNode | undefined {
  return children(node, name)[0];
}

export function descendant(node: XmlNode, name: string): XmlNode | undefined {
  if (localName(node.name) === name) return node;
  for (const candidate of node.children) {
    const result = descendant(candidate, name);
    if (result) return result;
  }
  return undefined;
}

export function attribute(node: XmlNode, name: string): string | undefined {
  const exact = node.attributes[name];
  if (exact != null) return exact;
  const entry = Object.entries(node.attributes).find(([key]) => localName(key) === name);
  return entry?.[1];
}

export function textContent(node: XmlNode | undefined): string {
  if (!node) return "";
  return `${node.text}${node.children.map(textContent).join("")}`.trim();
}

export function descendants(node: XmlNode, name: string): XmlNode[] {
  return node.children.flatMap((child) => [
    ...(localName(child.name) === name ? [child] : []),
    ...descendants(child, name),
  ]);
}

export function richTextContent(node: XmlNode): string {
  return descendants(node, "t")
    .map((text) => textContent(text))
    .join("");
}

export function numberAttribute(node: XmlNode, name: string, path: string): number {
  const value = Number(attribute(node, name));
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new XlsxChartImportError(`XLSX 图表中的 ${name} 无效：${path}`);
  }
  return value;
}

export async function readXml(zip: JSZip, path: string): Promise<XmlNode | undefined> {
  const file = zip.file(path);
  if (!file) return undefined;
  return parseXml(await file.async("string"), path);
}

export async function readRequiredXml(zip: JSZip, path: string): Promise<XmlNode> {
  const xml = await readXml(zip, path);
  if (!xml) throw new XlsxChartImportError(`XLSX 缺少 XML 部件：${path}`);
  return xml;
}
