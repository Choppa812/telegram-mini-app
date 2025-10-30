import { useEffect, useState } from 'react'

function App() {
  const [autoBuyEnabled, setAutoBuyEnabled] = useState(false)
  const [balance, setBalance] = useState(15.75)

  useEffect(() => {
    // Инициализация Telegram WebApp
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp
      tg.expand()
      tg.enableClosingConfirmation()
      
      // Устанавливаем темную тему
      tg.setHeaderColor('#1a1a1a')
      tg.setBackgroundColor('#0a0a0a')
    }
  }, [])

  const handleAutoBuyToggle = () => {
    setAutoBuyEnabled(!autoBuyEnabled)
    // Здесь будет логика включения/выключения авто-покупки
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.showAlert(
        `Автопокупка ${!autoBuyEnabled ? 'включена' : 'выключена'}`
      )
    }
  }

  const handleAddBalance = () => {
    // Логика пополнения баланса
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.showAlert('Пополнение баланса')
    }
  }

  return (
    <div className="app dark-theme">
      {/* Шапка */}
      <header className="app-header">
        <div className="header-content">
          <div className="auto-buy-section">
            <span className="auto-buy-label">Автопокупка</span>
            <div 
              className={`toggle ${autoBuyEnabled ? 'active' : ''}`}
              onClick={handleAutoBuyToggle}
            >
              <div className="toggle-handle"></div>
            </div>
          </div>
          
          <div className="balance-section">
            <div className="balance">
              <span className="ton-icon">💎</span>
              <span className="balance-amount">{balance}</span>
            </div>
            <div className="add-balance" onClick={handleAddBalance}>
              <div className="plus-icon">+</div>
            </div>
          </div>
        </div>
      </header>

      {/* Основной контент */}
      <main className="app-main">
        <div className="content-card">
          <h2>Автопокупка подарков</h2>
          <p className="status">
            Статус: <span className={autoBuyEnabled ? 'enabled' : 'disabled'}>
              {autoBuyEnabled ? 'Активна' : 'Неактивна'}
            </span>
          </p>
          
          <div className="features">
            <div className="feature-item">
              <div className="feature-icon">🎁</div>
              <div className="feature-text">
                <h3>Автоматическая покупка</h3>
                <p>Система автоматически покупает подарки при появлении новых</p>
              </div>
            </div>
            
            <div className="feature-item">
              <div className="feature-icon">⚡</div>
              <div className="feature-text">
                <h3>Мгновенная реакция</h3>
                <p>Покупка происходит в течение секунд после появления подарка</p>
              </div>
            </div>
            
            <div className="feature-item">
              <div className="feature-icon">🛡️</div>
              <div className="feature-text">
                <h3>Безопасность</h3>
                <p>Все транзакции защищены и прозрачны</p>
              </div>
            </div>
          </div>

          <button 
            className={`action-button ${autoBuyEnabled ? 'stop' : 'start'}`}
            onClick={handleAutoBuyToggle}
          >
            {autoBuyEnabled ? 'Остановить автопокупку' : 'Запустить автопокупку'}
          </button>
        </div>

        {/* Статистика */}
        <div className="stats-card">
          <h3>Статистика</h3>
          <div className="stats-grid">
            <div className="stat">
              <div className="stat-value">12</div>
              <div className="stat-label">Куплено подарков</div>
            </div>
            <div className="stat">
              <div className="stat-value">8.5</div>
              <div className="stat-label">Потрачено TON</div>
            </div>
            <div className="stat">
              <div className="stat-value">94%</div>
              <div className="stat-label">Успешных покупок</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App