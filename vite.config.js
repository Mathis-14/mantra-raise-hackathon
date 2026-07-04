import { defineConfig } from 'vite';

// La racine du dépôt est la racine du projet Vite.
// publicDir = game/assets → les packs Kenney (models/, sounds/, ui/) sont servis
// à la racine du site sans copie : ex. /models/mini-characters/Models/GLB format/character-male-a.glb
export default defineConfig({
  base: './',
  publicDir: 'game/assets',
  server: { host: true, open: false },
  build: { target: 'es2020', outDir: 'dist' },
});
