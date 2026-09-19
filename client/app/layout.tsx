import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Weather Agent",
  description:
    "Ask about the weather anywhere and get an answer researched from the live web, with the sources it came from.",
  applicationName: "Weather Agent",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The composer sits at the bottom; letting the layout viewport resize with the
  // on-screen keyboard is what keeps it reachable on mobile.
  interactiveWidget: "resizes-content",
};

/**
 * The design tokens in `globals.css` and Tailwind's `dark:` variant both key off
 * a `.dark` class, so something has to set it. This runs before first paint (no
 * flash of the wrong theme), follows the OS preference, and keeps following it
 * if the user changes it mid-session. `color-scheme` brings native widgets —
 * scrollbars, form controls, the caret — along with it.
 */
const themeScript = `(function(){try{var m=window.matchMedia("(prefers-color-scheme: dark)");var a=function(e){var d=e.matches;document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";};a(m);m.addEventListener("change",a);}catch(e){}})();`;

export interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
