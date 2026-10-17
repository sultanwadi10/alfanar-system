import type {
  MetadataRoute,
} from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Clock",
    short_name: "Clock",
    description:
      "Time and date",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color:
      "#0b0d10",
    theme_color:
      "#0b0d10",
    icons: [
      {
        src:
          "/clock-192.png",
        sizes:
          "192x192",
        type:
          "image/png",
        purpose:
          "any",
      },
      {
        src:
          "/clock-512.png",
        sizes:
          "512x512",
        type:
          "image/png",
        purpose:
          "any",
      },
      {
        src:
          "/clock-maskable-512.png",
        sizes:
          "512x512",
        type:
          "image/png",
        purpose:
          "maskable",
      },
    ],
  };
}
