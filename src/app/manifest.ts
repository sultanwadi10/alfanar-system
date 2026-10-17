import type {
  MetadataRoute,
} from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Calculator",
    short_name: "Calculator",
    description:
      "Calculator",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color:
      "#0d0f13",
    theme_color:
      "#0d0f13",
    icons: [
      {
        src:
          "/calculator-192.png",
        sizes:
          "192x192",
        type:
          "image/png",
        purpose:
          "any",
      },
      {
        src:
          "/calculator-512.png",
        sizes:
          "512x512",
        type:
          "image/png",
        purpose:
          "any",
      },
      {
        src:
          "/calculator-maskable-512.png",
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
