import type { Metadata } from "next";
import { Anton, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://cypher.example"),
  title: {
    default: "Cypher — Drop your bars. The crowd decides.",
    template: "%s | Cypher",
  },
  description:
    "Create a channel, share the code, drop tracks, and let the crowd crown the champion.",
  keywords: ["rap battles", "music competitions", "cypher", "trap", "drill"],
  openGraph: {
    title: "Cypher — The crowd decides.",
    description:
      "Online rap and trap competitions built for artists, hosts, and the crowd.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cypher — The crowd decides.",
    description: "Drop your bars. Let the crowd crown the champion.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${anton.variable} ${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="page-grain" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
