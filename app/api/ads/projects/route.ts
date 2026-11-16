import { handle, jsonBody } from "@/lib/ads/http";
import { newProject, UserError } from "@/lib/ads/service";
import { listProjects, saveProject } from "@/lib/ads/store";

export const runtime = "nodejs";

export function GET() {
  return handle(listProjects);
}

export function POST(request: Request) {
  return handle(async () => {
    const body = await jsonBody<{ name?: string; audience?: string; brief?: string; referenceIds?: string[] }>(request);
    const name = body.name?.trim();
    if (!name) throw new UserError("Give the project a name.");
    const project = newProject({
      name,
      audience: body.audience?.trim() ?? "",
      brief: body.brief?.trim() ?? "",
      referenceIds: Array.isArray(body.referenceIds) ? body.referenceIds.map(String) : [],
    });
    await saveProject(project);
    return project;
  });
}
