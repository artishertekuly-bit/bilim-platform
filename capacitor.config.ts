import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kz.sana.bilim',
  appName: 'Sana Bilim',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
