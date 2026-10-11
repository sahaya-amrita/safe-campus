import webpush from 'web-push';

/**
 * Generates a VAPID key pair for Web Push (Phase 8). Store both values in the
 * deployment's secret settings (never in the repository) together with
 * PUSH_PROVIDER=webpush and VAPID_SUBJECT=mailto:<team address>.
 */
const keys = webpush.generateVAPIDKeys();
process.stdout.write(
  [
    'New VAPID keys. Put these in the server environment; do not commit them.',
    `VAPID_PUBLIC_KEY=${keys.publicKey}`,
    `VAPID_PRIVATE_KEY=${keys.privateKey}`,
    '',
  ].join('\n'),
);
