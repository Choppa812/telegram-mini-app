import { TonConnect } from '@tonconnect/sdk';

// Используем твой домен от Vercel
const manifestUrl = 'https://telegram-mini-app-sigma-three.vercel.app/tonconnect-manifest.json';

// Создаем коннектор
export const connector = new TonConnect({ manifestUrl });

// Функция для генерации универсальной ссылки подключения
export const generateConnectUrl = async () => {
  try {
    // Получаем ссылку для подключения через коннектор
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

// Функция для генерации правильной ссылки для Telegram Wallet
export const generateTelegramWalletLink = (universalLink) => {
  // Правильное кодирование для Telegram Mini App
  const encoded = btoa(universalLink)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  // Правильный формат для открытия кошелька в Telegram
  return `https://t.me/wallet?startattach=${encoded}`;
};