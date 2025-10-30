import { useEffect } from 'react'

function WalletPage({ onBack, balance }) {
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

  const handleConnectWallet = () => {
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.showAlert('Подключение TON кошелька...')
    }
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
        </div>

        <button className="connect-wallet-btn" onClick={handleConnectWallet}>
          <span className="ton-logo">💎</span>
          <span className="connect-text">Connect Wallet</span>
        </button>

        <div className="wallet-info">
          <h3>Информация о кошельке</h3>
          <p>Подключите TON кошелек для пополнения баланса и управления средствами</p>
        </div>
      </main>
    </div>
  )
}

export default WalletPage