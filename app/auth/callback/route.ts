import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { runCallbackGate } from "@/lib/auth-callback";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=missing-code", req.url));

  const supabase = await createSupabaseServerClient();
  const { data: exchange, error: exErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exErr || !exchange.session) {
    return NextResponse.redirect(new URL("/login?error=exchange-failed", req.url));
  }

  const { user } = exchange;
  const svc = createSupabaseServiceClient();

  const gate = await runCallbackGate(
    {
      id: user!.id,
      email: user!.email!,
      email_verified: (user!.user_metadata?.email_verified === true) || (user!.email_confirmed_at != null),
    },
    svc
  );

  if (gate.kind === "redirect") {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL(gate.to, req.url));
  }
  return NextResponse.redirect(new URL("/", req.url));
}
