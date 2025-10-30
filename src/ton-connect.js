import { TonConnect } from '@tonconnect/sdk';

const manifestUrl = 'https://telegram-mini-app-sigma-three.vercel.app/tonconnect-manifest.json';

export const connector = new TonConnect({ manifestUrl });

// Функция для инициализации подключения
export const initializeConnection = async () => {
  try {
    // Проверяем есть ли уже подключенный кошелек
    if (connector.connected) {
      return connector;
    }

    // Создаем ссылку для подключения
    const universalLink = connector.connect({
      bridgeUrl: 'https://bridge.tonapi.io/bridge',
      universalLink: 'https://tc.tonkeeper.com'
    });
    
    return {
      connector,
      universalLink
    };
  } catch (error) {
    console.error('Error initializing connection:', error);
    throw error;
  }
};

// Функция для генерации ссылки Telegram Wallet
export const generateTelegramWalletLink = (universalLink) => {
  const encoded = btoa(unescape(encodeURIComponent(universalLink)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return `https://t.me/wallet?startattach=${encoded}`;
};