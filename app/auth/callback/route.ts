import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  try {
    if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
      const publicOrigin = process.env.NODE_ENV === "development" || !forwardedHost
        ? origin
        : `${forwardedProto}://${forwardedHost}`;
      const destination = new URL(next, publicOrigin);
      destination.searchParams.set("auth", "success");
      return NextResponse.redirect(destination);
    }
  }
  } catch (caught) {
    const details = caught instanceof Error ? { name: caught.name } : { name: "UnknownError" };
    console.error("[auth/callback] Session exchange failed", details);
  }

  const destination = new URL(next, origin);
  destination.searchParams.set("auth", "error");
  return NextResponse.redirect(destination);
}
