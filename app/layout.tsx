import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { META_PIXEL_ID } from "@/lib/meta";
import "./globals.css";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const sans = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Facial Concern & Technology Map | Harley Street Aesthetics",
  description:
    "Doctor-trained AI informed by thousands of aesthetic concern patterns, identifying one primary and up to three secondary facial priorities for an HSA consultation.",
  applicationName: "Harley Street Aesthetics",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "HSA Consultation Map" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#FBF8F3",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB" className={`${display.variable} ${sans.variable}`}>
      <head>
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${META_PIXEL_ID}');
          fbq('track', 'PageView');`}
        </Script>
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            alt=""
            src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          />
        </noscript>
      </head>
      <body>
        {/* HSA atmosphere — ivory, charcoal and restrained gold */}
        <div className="atmosphere">
          <div
            className="orb"
            style={{
              top: "-10%",
              right: "-5%",
              width: "50vmax",
              height: "50vmax",
              background:
                "radial-gradient(circle at 50% 50%, #f3e3ae, #e8cf7a 55%, transparent 72%)",
              opacity: 0.4,
              filter: "blur(70px)",
            }}
          />
          <div
            className="orb"
            style={{
              bottom: "-15%",
              left: "-8%",
              width: "45vmax",
              height: "45vmax",
              background:
                "radial-gradient(circle at 50% 50%, #fffaf0, #eee3ce 60%, transparent 72%)",
              opacity: 0.5,
              filter: "blur(60px)",
            }}
          />
        </div>
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
