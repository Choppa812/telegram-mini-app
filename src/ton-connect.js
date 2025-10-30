import { TonConnect } from '@tonconnect/sdk';

const manifestUrl = 'https://telegram-mini-app-sigma-three.vercel.app/tonconnect-manifest.json';

export const connector = new TonConnect({ manifestUrl });

export const generateConnectUrl = async (connector) => {
  try {
    const connectionSource = {
      universalLink: 'https://app.tonkeeper.com/ton-connect',
      bridgeUrl: 'https://bridge.tonapi.io/bridge'
    };
    
    const universalLink = connector.connect(connectionSource);
    return universalLink;
  } catch (error) {
    console.error('Error generating connect URL:', error);
    throw error;
  }
};