import JSZip from "jszip";

const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function nextRelationshipId(xml: string): string {
  const ids = [...xml.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
  return `rId${Math.max(0, ...ids) + 1}`;
}

function appendRelationship(xml: string, relationship: string): string {
  return xml.replace("</Relationships>", `${relationship}</Relationships>`);
}

function appendContentType(xml: string, partName: string, contentType: string): string {
  if (xml.includes(`PartName="${partName}"`)) return xml;
  return xml.replace(
    "</Types>",
    `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`,
  );
}

function drawingRelationshipXml(drawingPath: string, relationshipId: string): string {
  return `<Relationship Id="${relationshipId}" Type="${OFFICE_REL_NS}/drawing" Target="../drawings/${drawingPath}"/>`;
}

export type WorksheetDrawingPackage = {
  worksheetPath: string;
  drawingPath: string;
  drawingXml: string;
  drawingRelationshipsXml: string;
  chartParts: readonly { path: string; xml: string }[];
};

export async function assembleXlsxPackage(
  baseBuffer: ArrayBuffer,
  drawings: readonly WorksheetDrawingPackage[],
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(baseBuffer);
  let contentTypes = await zip.file("[Content_Types].xml")?.async("string");
  if (!contentTypes) throw new Error("XLSX package is missing [Content_Types].xml");

  for (const drawing of drawings) {
    const worksheetXml = await zip.file(drawing.worksheetPath)?.async("string");
    if (!worksheetXml) throw new Error(`XLSX package is missing ${drawing.worksheetPath}`);

    const worksheetRelsPath = `${drawing.worksheetPath.replace("xl/worksheets/", "xl/worksheets/_rels/")}.rels`;
    const existingWorksheetRels = await zip.file(worksheetRelsPath)?.async("string");
    const worksheetRels =
      existingWorksheetRels ??
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${PACKAGE_REL_NS}"></Relationships>`;
    const relationshipId = nextRelationshipId(worksheetRels);
    const updatedWorksheetRels = appendRelationship(
      worksheetRels,
      drawingRelationshipXml(
        drawing.drawingPath.split("/").at(-1) ?? drawing.drawingPath,
        relationshipId,
      ),
    );
    const updatedWorksheetXml = worksheetXml.includes("<drawing ")
      ? worksheetXml
      : worksheetXml.replace("</worksheet>", `<drawing r:id="${relationshipId}"/></worksheet>`);

    zip.file(drawing.worksheetPath, updatedWorksheetXml);
    zip.file(worksheetRelsPath, updatedWorksheetRels);
    zip.file(`xl/drawings/${drawing.drawingPath}`, drawing.drawingXml);
    zip.file(`xl/drawings/_rels/${drawing.drawingPath}.rels`, drawing.drawingRelationshipsXml);
    contentTypes = appendContentType(
      contentTypes,
      `/xl/drawings/${drawing.drawingPath}`,
      "application/vnd.openxmlformats-officedocument.drawing+xml",
    );

    for (const chart of drawing.chartParts) {
      zip.file(`xl/charts/${chart.path}`, chart.xml);
      contentTypes = appendContentType(
        contentTypes,
        `/xl/charts/${chart.path}`,
        "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
      );
    }
  }

  zip.file("[Content_Types].xml", contentTypes);
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}
