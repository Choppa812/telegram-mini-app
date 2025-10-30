import { useEffect, useState } from 'react'
import WalletPage from './WalletPage.jsx'

function App() {
  const [autoBuyEnabled, setAutoBuyEnabled] = useState(true)
  const [balance, setBalance] = useState(15.75)
  const [currentPage, setCurrentPage] = useState('main') // 'main' или 'wallet'

  useEffect(() => {
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp
      tg.expand()
      tg.setHeaderColor('#1a1a1a')
      tg.setBackgroundColor('#0a0a0a')
    }
  }, [])

  const handleAutoBuyToggle = () => {
    setAutoBuyEnabled(!autoBuyEnabled)
  }

  const handleAddBalance = () => {
    setCurrentPage('wallet')
  }

  const handleBackToMain = () => {
    setCurrentPage('main')
  }

  // Если открыта страница кошелька, показываем ее
  if (currentPage === 'wallet') {
    return <WalletPage onBack={handleBackToMain} balance={balance} />
  }

  // Основная страница
  return (
    <div className="app dark-theme">
      {/* Шапка */}
      <header className="app-header">
        <div className="header-top">
          <div className="auto-buy-toggle">
            <span className="toggle-label">Автопокупка</span>
            <div 
              className={`toggle ${autoBuyEnabled ? 'active' : ''}`}
              onClick={handleAutoBuyToggle}
            >
              <div className="toggle-slider"></div>
            </div>
          </div>
          
          <div className="balance-container">
            <div className="balance-display">
              <span className="ton-symbol">💎</span>
              <span className="balance-amount">{balance} TON</span>
            </div>
            <button className="add-balance-btn" onClick={handleAddBalance}>
              <span className="plus-icon">+</span>
            </button>
          </div>
        </div>
      </header>

      {/* Основной контент */}
      <main className="main-content">
        <div className="status-card">
          <div className="status-header">
            <h2>Автопокупка подарков</h2>
            <div className={`status-badge ${autoBuyEnabled ? 'active' : 'inactive'}`}>
              {autoBuyEnabled ? 'Активна' : 'Неактивна'}
            </div>
          </div>
          
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🎁</div>
              <div className="feature-content">
                <h3>Автоматическая покупка</h3>
                <p>Система автоматически покупает подарки при появлении новых</p>
              </div>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <div className="feature-content">
                <h3>Мгновенная реакция</h3>
                <p>Покупка происходит в течение секунд после появления подарка</p>
              </div>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">🛡️</div>
              <div className="feature-content">
                <h3>Безопасность</h3>
                <p>Все транзакции защищены и прозрачны</p>
              </div>
            </div>
          </div>

          <button 
            className={`action-btn ${autoBuyEnabled ? 'stop' : 'start'}`}
            onClick={handleAutoBuyToggle}
          >
            {autoBuyEnabled ? 'Остановить автопокупку' : 'Запустить автопокупку'}
          </button>
        </div>

        {/* Статистика */}
        <div className="stats-card">
          <h3 className="stats-title">Статистика</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-number">12</div>
              <div className="stat-label">Куплено подарков</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">8.5</div>
              <div className="stat-label">Потрачено TON</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">94%</div>
              <div className="stat-label">Успешных покупок</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App