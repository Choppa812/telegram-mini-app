import { useState, useEffect } from 'react';
import { openWalletConnection, connector, getConnectionStatus } from './ton-connect.js';

const WalletPage = ({ onBack, balance }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);

  useEffect(() => {
    // Проверяем статус подключения при загрузке
    checkConnectionStatus();
    
    // Слушаем события изменения статуса подключения
    const unsubscribe = connector.onStatusChange((wallet) => {
      setConnectionStatus(getConnectionStatus());
      console.log('Wallet status changed:', wallet);
    });

    return () => unsubscribe();
  }, []);

  const checkConnectionStatus = () => {
    const status = getConnectionStatus();
    setConnectionStatus(status);
  };

  const handleConnectWallet = async () => {
    try {
      setIsConnecting(true);
      await openWalletConnection();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectWallet();
      setConnectionStatus(getConnectionStatus());
    } catch (error) {
      console.error('Failed to disconnect wallet:', error);
    }
  };

  return (
    <div className="wallet-page">
      <header className="wallet-header">
        <button className="back-button" onClick={onBack}>
          ← Назад
        </button>
        <h2>Кошелек</h2>
      </header>

      <div className="wallet-content">
        <div className="balance-section">
          <h3>Ваш баланс</h3>
          <div className="balance-amount">{balance} TON</div>
        </div>

        <div className="connection-section">
          <h3>Подключение кошелька</h3>
          
          {connectionStatus?.connected ? (
            <div className="connected-wallet">
              <p>✅ Кошелек подключен</p>
              <p>Адрес: {connectionStatus.account?.address.slice(0, 8)}...{connectionStatus.account?.address.slice(-8)}</p>
              <button onClick={handleDisconnect} className="disconnect-btn">
                Отключить
              </button>
            </div>
          ) : (
            <div className="connect-wallet">
              <p>Подключите кошелек для управления средствами</p>
              <button 
                onClick={handleConnectWallet} 
                disabled={isConnecting}
                className="connect-btn"
              >
                {isConnecting ? 'Подключение...' : 'Подключить кошелек'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WalletPage;