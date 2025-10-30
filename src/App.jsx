import { useEffect, useState } from 'react'

function App() {
  const [autoBuyEnabled, setAutoBuyEnabled] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [subscriptions, setSubscriptions] = useState([
    {
      id: 1,
      name: "Bow Tie",
      description: "Все модели Black",
      price: "до 21.2 ₽",
      status: "Вкл ➤ до 21.2 ₽ (1шт.)",
      active: true
    },
    {
      id: 2,
      name: "Light Sword", 
      description: "Все модели Black",
      price: "до 17 ₽",
      status: "Вкл ➤ до 17 ₽ (1шт.)",
      active: true
    },
    {
      id: 3,
      name: "Moon Pendant",
      description: "Все модели Black", 
      price: "до 18.3 ₽",
      status: "Вкл ➤ до 17.21 ₽ (1шт.)",
      active: true
    },
    {
      id: 4,
      name: "Lunar Snake",
      description: "Все модели Black",
      price: "до 9 ₽", 
      status: "Вкл ➤ до 7.6 ₽ (1шт.)",
      active: true
    },
    {
      id: 5,
      name: "Jelly Bunny",
      description: "Все модели Black",
      price: "до 13.61 ₽",
      status: "Подписки",
      active: false
    },
    {
      id: 6, 
      name: "Stellar Rocket",
      description: "Все модели Black",
      price: "до 15 ₽",
      status: "Вкл ➤ до 5 ₽ (1шт.)",
      active: true
    }
  ])

  useEffect(() => {
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp
      tg.expand()
      tg.setHeaderColor('#1a1a1a')
      tg.setBackgroundColor('#0a0a0a')
    }
  }, [])

  const toggleAutoBuy = () => {
    setAutoBuyEnabled(!autoBuyEnabled)
  }

  const removeSubscription = (id) => {
    setSubscriptions(subscriptions.filter(sub => sub.id !== id))
  }

  const addSlot = () => {
    // Логика добавления слота
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.showAlert('Добавление слота за 0.4 ₽')
    }
  }

  const addSubscription = () => {
    // Логика добавления подписки
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.showAlert('Добавление подписки')
    }
  }

  return (
    <div className="app dark-theme">
      {/* Шапка с статусом автобая */}
      <header className="app-header">
        <div className="header-status">
          <div className={`status-badge ${autoBuyEnabled ? 'enabled' : 'disabled'}`}>
            {autoBuyEnabled ? 'Автобай включен' : 'Автобай выключен'}
          </div>
        </div>
      </header>

      {/* Навигация коллекции */}
      <nav className="collection-nav">
        <div className="nav-title">Коллекция</div>
        <div className="nav-tabs">
          <button 
            className={`tab ${activeTab === 'background' ? 'active' : ''}`}
            onClick={() => setActiveTab('background')}
          >
            Фон
          </button>
          <button 
            className={`tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            Все
          </button>
          <button 
            className={`tab ${activeTab === 'date' ? 'active' : ''}`}
            onClick={() => setActiveTab('date')}
          >
            Дата
          </button>
        </div>
      </nav>

      {/* Статистика слотов */}
      <div className="slots-info">
        <div className="slots-stats">
          Всего 18 слотов | Создано 18 ордеров
        </div>
        <div className="slots-actions">
          <button className="slot-action" onClick={addSlot}>
            + слот за 0.4 ₽
          </button>
          <button className="subscription-action" onClick={addSubscription}>
            + Добавить подписку
          </button>
        </div>
      </div>

      {/* Список подписок */}
      <main className="subscriptions-list">
        {subscriptions.map((sub) => (
          <div key={sub.id} className="subscription-item">
            <div className="subscription-header">
              <div className="sub-name">{sub.name}</div>
              <div className="sub-price">{sub.price}</div>
            </div>
            <div className="subscription-description">
              {sub.description}
            </div>
            <div className="subscription-footer">
              <div className={`sub-status ${sub.active ? 'active' : 'inactive'}`}>
                {sub.status}
              </div>
              <button 
                className="remove-btn"
                onClick={() => removeSubscription(sub.id)}
              >
                Удалить
              </button>
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}

export default App