import { clerkMiddleware } from "@clerk/nextjs/server";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { NextResponse } from "next/server";

export default clerkMiddleware(
  () => NextResponse.next(),
  (request) => ({
    publishableKey: publishableKeyFromHost(
      request.headers.get("x-forwarded-host")?.replace(/:\d+$/, "") ?? request.nextUrl.hostname,
      process.env.VITE_CLERK_PUBLISHABLE_KEY,
    ),
    proxyUrl: process.env.CLERK_PROXY_URL,
  }),
);

export const config = {
  matcher: [
    "/((?!_next|.*\\.(?:html?|css|js(?!on)|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|map)).*)",
    "/(api|trpc)(.*)",
  ],
};