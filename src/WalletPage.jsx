import { useEffect, useState } from 'react'
import WalletConnectModal from './components/WalletConnectModal'

function WalletPage({ onBack, balance }) {
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [walletConnected, setWalletConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState('')

  useEffect(() => {
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp
      tg.BackButton.show()
      tg.BackButton.onClick(() => {
        onBack()
      })
    }

    return () => {
      if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.BackButton.offClick()
      }
    }
  }, [onBack])

  const handleWalletConnected = (walletInfo) => {
    console.log('Wallet connected:', walletInfo)
    setWalletConnected(true)
    setWalletAddress(walletInfo?.address || 'Connected')
    setShowConnectModal(false)
  }

  return (
    <div className="wallet-page">
      <header className="wallet-header">
        <h1>Баланс</h1>
      </header>

      <main className="wallet-main">
        <div className="balance-card">
          <div className="balance-amount-large">
            <span className="ton-icon-large">💎</span>
            <span className="balance-number">{balance} TON</span>
          </div>
          <p className="balance-label">Текущий баланс</p>
          
          {walletConnected && (
            <div className="wallet-connected">
              <p>Кошелек подключен: {walletAddress}</p>
            </div>
          )}
        </div>

        {!walletConnected ? (
          <button 
            className="connect-wallet-btn" 
            onClick={() => setShowConnectModal(true)}
          >
            <span className="ton-logo">💎</span>
            <span className="connect-text">Connect Wallet</span>
          </button>
        ) : (
          <div className="wallet-actions">
            <button className="disconnect-btn">
              Отключить кошелек
            </button>
          </div>
        )}

        {showConnectModal && (
          <WalletConnectModal 
            onClose={() => setShowConnectModal(false)}
            onWalletConnected={handleWalletConnected}
          />
        )}

        <div className="wallet-info">
          <h3>Информация о кошельке</h3>
          <p>Подключите TON кошелек для пополнения баланса и управления средствами</p>
        </div>
      </main>
    </div>
  )
}

export default WalletPage