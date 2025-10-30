import { TonConnect } from '@tonconnect/sdk';

const manifestUrl = 'https://telegram-mini-app-sigma-three.vercel.app/tonconnect-manifest.json';

export const connector = new TonConnect({ manifestUrl });

export const generateConnectUrl = async () => {
  try {
    const universalLink = await connector.connect({
      bridgeUrl: 'https://bridge.tonapi.io/bridge',
      universalLink: 'https://tc.tonkeeper.com'
    });
    
    return universalLink;
  } catch (error) {
    console.error('Error generating connect URL:', error);
    throw error;
  }
};

export const generateTelegramWalletLink = (universalLink) => {
  const encoded = btoa(unescape(encodeURIComponent(universalLink)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return `https://t.me/wallet?startattach=${encoded}&choose_currency=TON`;
};