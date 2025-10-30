import { TonConnect } from '@tonconnect/sdk';

const manifestUrl = 'https://telegram-mini-app-sigma-three.vercel.app/tonconnect-manifest.json';

export const connector = new TonConnect({ manifestUrl });

// Функция для инициализации подключения
export const initializeConnection = async () => {
  try {
    if (connector.connected) {
      return connector;
    }

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

// Функция для открытия кошелька
export const openWalletConnection = async () => {
  try {
    const connection = await initializeConnection();
    const telegramWalletLink = generateTelegramWalletLink(connection.universalLink);
    
    console.log('Wallet link:', telegramWalletLink);
    
    // Проверяем, находимся ли мы внутри Telegram WebView
    const isTelegramWebView = window.Telegram && window.Telegram.WebApp;
    
    if (isTelegramWebView && window.Telegram.WebApp.openLink) {
      // Используем метод Telegram для открытия ссылки
      window.Telegram.WebApp.openLink(telegramWalletLink);
    } else {
      // Fallback для браузера
      window.open(telegramWalletLink, '_blank');
    }
    
    return connection;
  } catch (error) {
    console.error('Error opening wallet connection:', error);
    throw error;
  }
};

// Функция для отключения кошелька
export const disconnectWallet = async () => {
  try {
    await connector.disconnect();
    console.log('Wallet disconnected');
  } catch (error) {
    console.error('Error disconnecting wallet:', error);
    throw error;
  }
};

// Функция для проверки статуса подключения
export const getConnectionStatus = () => {
  return {
    connected: connector.connected,
    account: connector.account,
    wallet: connector.wallet
  };
};