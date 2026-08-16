import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sere",
    short_name: "Sere",
    description: "Jobs, invoices, payments, and cash for HVAC shops.",
    start_url: "/overview",
    scope: "/",
    display: "standalone",
    background_color: "#f8f7fc",
    theme_color: "#5b38d6",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
