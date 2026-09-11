import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-session";
import { accountCanAccessAdminPath } from "@/lib/accountPages";
import { homeForRole, normalizeRole } from "@/lib/roles";

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);

  const path = request.nextUrl.pathname;
  if (!path.startsWith("/admin")) return response;

  // Signed out: leave it to the page's own guard, which also handles the
  // two-factor step. Nothing is served from the server for an anonymous
  // request here — the console pages render client-side behind AuthGuard.
  if (!user) return response;

  const role = normalizeRole(user.user_metadata?.role);
  if (accountCanAccessAdminPath(role, user.user_metadata?.pages, path)) return response;

  // Denied. AuthGuard enforces the same rule in the browser, but it can only
  // act once the page has already been delivered — pasting a console URL got
  // the page and its client-side data fetches either way. Redirecting here
  // settles it before any of that runs.
  const url = request.nextUrl.clone();
  url.pathname = homeForRole(role);
  url.search = "";
  const redirect = NextResponse.redirect(url);
  // Carry over any refreshed auth cookies, or the redirect would drop the
  // rotated token and sign the user out on the way to their own home page.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  matcher: [
    /*
     * Run on every request except static assets and image optimization.
     * Tweak the negative lookahead to opt routes out.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
