import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import BottomNav from "@/components/mobile/bottom-nav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Expense Tracker",
  description: "Personal expense tracker",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Expenses",
  },
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

// Runs before React hydrates so there's no light->dark flash on load.
const darkBootstrap = `
  try {
    var m = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (m) document.documentElement.classList.add('dark');
  } catch (_) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: darkBootstrap }} />
      </head>
      <body className={inter.className}>
        <Providers>
          <div className="pb-[calc(env(safe-area-inset-bottom)+4rem)] md:pb-0 min-h-screen">
            {children}
          </div>
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
