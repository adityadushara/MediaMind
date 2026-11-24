import { NextResponse, connection } from "next/server";
import { buildHealthReport } from "@/lib/server/health";

export async function GET() {
  // Ensure the check runs per request instead of at build time.
  await connection();
  const report = await buildHealthReport();
  return NextResponse.json(report, {
    status: report.status === "healthy" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
