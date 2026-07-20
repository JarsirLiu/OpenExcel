import type { LoaderFunctionArgs } from "react-router-dom";
import { getDemoDefinitionById } from "@/features/demos/registry";

export async function demoLoader({ params }: LoaderFunctionArgs) {
  const demo = params.demoId ? getDemoDefinitionById(params.demoId) : null;
  if (!demo) {
    throw new Response(null, { status: 404, statusText: "Demo not found" });
  }

  return { demo };
}
