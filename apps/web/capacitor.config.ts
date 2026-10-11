import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android app for Amrita Sahaya (Capacitor). The app loads the hosted site,
 * so every deploy of `main` on Render appears in the app without a new APK.
 * Only native changes (icon, permissions, this file) need a rebuild.
 * The bundled dist/ is a fallback shell only.
 */
const config: CapacitorConfig = {
  appId: 'org.sahaya.campus',
  appName: 'Amrita Sahaya',
  webDir: 'dist',
  server: {
    url: 'https://safe-campus-web.onrender.com',
    cleartext: false,
  },
  android: { allowMixedContent: false },
};

export default config;
