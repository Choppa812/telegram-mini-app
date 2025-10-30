import { TonConnect } from '@tonconnect/sdk';

// Временный манифест - потом заменим на твой домен
const manifestUrl = 'https://telegram-mini-app-sigma-three.vercel.app/tonconnect-manifest.json';

export const connector = new TonConnect({ manifestUrl });

export const generateConnectUrl = (connector) => {
  return connector.connect({
    tonProof: false,
    notifications: false
  });
};