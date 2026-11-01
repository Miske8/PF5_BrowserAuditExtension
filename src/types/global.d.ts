export {};

declare global {
  // Réservé pour les tests d'intégration de la popup et du moteur (Étapes 9-12).
  interface Window {
    __A11Y_LENS_TEST_HOOKS__?: Record<string, unknown>;
  }
}
