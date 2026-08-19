import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title: "Signal Control",
    description: "Create and manage your trading signals.",
    openGraph: {
      title: "Signal Control",
      description: "Create and manage your trading signals.",
      images: [{ url: imageUrl, width: 1536, height: 1024, alt: "Signal Control interface" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Signal Control",
      description: "Create and manage your trading signals.",
      images: [imageUrl],
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const hostname = forwardedHost.replace(/:\d+$/, "");
  const clerkPubKey = publishableKeyFromHost(
    hostname,
    process.env.VITE_CLERK_PUBLISHABLE_KEY,
  );
  const clerkProxyUrl = process.env.CLERK_PROXY_URL;

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      localization={{
        signIn: {
          start: {
            title: "Sign in to StopLoss",
          },
        },
      }}
      appearance={{
        elements: {
          modalContent: {
            backgroundColor: "#091421",
            border: "1px solid #273952",
            borderRadius: "18px",
            boxShadow: "0 28px 80px rgba(0, 0, 0, .45)",
            margin: "auto",
          },
          card: {
            backgroundColor: "#091421",
            borderRadius: "18px",
            boxShadow: "none",
          },
          headerTitle: {
            display: "none",
          },
          headerSubtitle: {
            color: "#a8b4c6",
          },
          socialButtonsBlockButton: {
            backgroundColor: "#0b1625",
            border: "0.6px solid rgba(177, 177, 189, .5)",
            color: "#f7f8fb",
          },
          formFieldInput: {
            backgroundColor: "#000000",
            border: "1px solid rgba(177, 177, 189, .5)",
            color: "#f7f8fb",
          },
          formFieldLabel: {
            color: "#a8b4c6",
          },
          formButtonPrimary: {
            background: "linear-gradient(135deg, #a550ff, #6f36da)",
            color: "#ffffff",
          },
          dividerLine: {
            backgroundColor: "#273952",
          },
          dividerText: {
            color: "#8794a7",
          },
          modalCloseButton: {
            color: "#a8b4c6",
          },
          footer: {
            display: "none",
          },
          footerActionText: {
            color: "#a8b4c6",
          },
          footerActionLink: {
            color: "#c17cff",
          },
          footerPages: {
            display: "none",
          },
        },
      }}
    >
      <html lang="en">
        <body className={geist.variable}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
