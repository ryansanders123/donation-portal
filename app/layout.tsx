import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { getActiveOrg } from "@/lib/org-context";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const FALLBACK_ORG_NAME = process.env.NEXT_PUBLIC_ORG_NAME ?? "Donation Portal";

export async function generateMetadata(): Promise<Metadata> {
  // Best-effort: anonymous request returns null and we fall through to env var.
  try {
    const org = await getActiveOrg();
    const name = org?.name ?? FALLBACK_ORG_NAME;
    const iconUrl = org?.favicon_url ?? org?.logo_url ?? null;
    return {
      title: name,
      description: `${name} - donation management portal`,
      ...(iconUrl ? { icons: { icon: iconUrl } } : {}),
    };
  } catch {
    return {
      title: FALLBACK_ORG_NAME,
      description: `${FALLBACK_ORG_NAME} - donation management portal`,
    };
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="antialiased font-sans text-stone-900">
        {children}
      </body>
    </html>
  );
}
