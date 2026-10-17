import type {
  Metadata,
  Viewport,
} from "next";
import {
  Geist,
  Geist_Mono,
} from "next/font/google";

import "./globals.css";

const geistSans = Geist({
  variable:
    "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable:
    "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clock",
  description:
    "Time and date",
  applicationName:
    "Clock",
  appleWebApp: {
    capable: true,
    title: "Clock",
    statusBarStyle:
      "black-translucent",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  icons: {
    icon: [
      {
        url:
          "/clock-192.png",
        sizes:
          "192x192",
        type:
          "image/png",
      },
      {
        url:
          "/clock-512.png",
        sizes:
          "512x512",
        type:
          "image/png",
      },
    ],
    apple: [
      {
        url:
          "/clock-180.png",
        sizes:
          "180x180",
        type:
          "image/png",
      },
    ],
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width:
    "device-width",
  initialScale: 1,
  viewportFit:
    "cover",
  themeColor:
    "#0b0d10",
  colorScheme:
    "dark",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        {children}
      </body>
    </html>
  );
}
