export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ app: "olivia-cantorigo", instance: process.env.CANTO_LAUNCH_ID ?? null }, { headers: { "Cache-Control": "no-store" } });
}
