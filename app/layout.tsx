import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      publishableKey={process.env.VITE_CLERK_PUBLISHABLE_KEY}
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
            boxShadow: "0 28px 80px rgba(0, 0, 0, .45)",
          },
          card: {
            backgroundColor: "#091421",
            boxShadow: "none",
          },
          headerTitle: {
            color: "#f7f8fb",
          },
          headerSubtitle: {
            color: "#a8b4c6",
          },
          socialButtonsBlockButton: {
            backgroundColor: "#0b1625",
            border: "1px solid #b1b1bd",
            color: "#f7f8fb",
          },
          formFieldInput: {
            backgroundColor: "#000000",
            border: "1px solid rgba(255, 255, 255, .278)",
            color: "#f7f8fb",
          },
          formFieldLabel: {
            color: "#ffffff",
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
            backgroundColor: "#091421",
            borderTop: "1px solid #273952",
          },
          footerActionText: {
            color: "#a8b4c6",
          },
          footerActionLink: {
            color: "#c17cff",
          },
          footerPages: {
            backgroundColor: "#091421",
            color: "#8794a7",
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
