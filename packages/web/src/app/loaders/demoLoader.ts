import type { LoaderFunctionArgs } from "react-router-dom";
import { loadDemoDefinitionById } from "@/features/demos/registry";

type DemoLoaderArgs = Pick<LoaderFunctionArgs, "params">;

export async function demoLoader({ params }: DemoLoaderArgs) {
  const demo = params.demoId ? await loadDemoDefinitionById(params.demoId) : null;
  if (!demo) {
    throw new Response(null, { status: 404, statusText: "Demo not found" });
  }

  return { demo };
}
