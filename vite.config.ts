import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  server: {
    // Vite por defecto puede resolver "localhost" solo a IPv6 ([::1]) en
    // algunas redes (típico en redes corporativas/universitarias), dejando
    // http://localhost:5173 sin respuesta si el navegador prueba IPv4
    // primero. Escuchar en todas las interfaces evita ese problema y de
    // paso permite abrir la app desde el móvil en la misma red sin flags.
    host: true,
  },
  plugins: [
    react(),
    VitePWA({
      // "prompt", nunca "autoUpdate": el usuario puede estar registrando
      // estadísticas en directo cuando hay una versión nueva, y una recarga
      // automática le interrumpiría a mitad de un partido. El registro se
      // hace a mano desde PwaUpdateBanner.tsx (virtual:pwa-register/react),
      // así que la inyección automática del plugin queda desactivada.
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["balonmano.webp", "icons/*.png"],
      manifest: {
        name: "Club Balonmano — Planificación Deportiva",
        short_name: "Balonmano",
        description: "Gestión de planificación deportiva del club de balonmano",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webp,woff2}"],
        // Por defecto el precaché del service worker rechaza archivos de más de 2 MiB
        // (falla el build entero, no solo los omite) — las 4 imágenes de fondo
        // estacionales (public/hero/*.png) llegan a 2.64 MB. Subir el límite a 3 MiB
        // desbloquea el build; comprimir esas imágenes sigue siendo buena idea aparte,
        // para no cachear tanto peso offline.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // Excluye las URLs firmadas de Storage (usadas por MiniaturaImagen
            // para <img src>, con token de un solo uso en la query string):
            // cachearlas como si fueran respuestas de la API llenaría este
            // caché de 100 entradas de basura irrecuperable en cada render,
            // desplazando las respuestas reales de la API que este caché
            // existe para guardar.
            urlPattern: ({ url }) =>
              url.hostname.endsWith("supabase.co") && !url.pathname.startsWith("/storage/v1/object/sign"),
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api-cache",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
