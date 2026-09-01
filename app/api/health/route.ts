import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Quick diagnostic: does the running function actually see the env vars?
// Returns booleans only — never the secret values.
export async function GET() {
  return NextResponse.json({
    anthropicKey: !!process.env.ANTHROPIC_API_KEY,
    anthropicWorkspaceId: !!process.env.ANTHROPIC_WORKSPACE_ID,
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5 (default)",
    supabaseUrl: !!process.env.SUPABASE_URL,
    supabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
