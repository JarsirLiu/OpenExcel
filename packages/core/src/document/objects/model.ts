export type DocumentObjectType = "chart" | "image" | "comment" | "custom";

export interface DocumentObject {
  id: string;
  type: DocumentObjectType;
  position: Record<string, unknown>;
  data: Record<string, unknown>;
}

export interface DocumentObjectPatch {
  position?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

export interface CreateObjectOperation {
  type: "createObject";
  object: DocumentObject;
}
