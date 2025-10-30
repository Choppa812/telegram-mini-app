import { useEffect, useState } from 'react'

function App() {
  const [autoBuyEnabled, setAutoBuyEnabled] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [selectedColor, setSelectedColor] = useState('Azure Blue')
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

  const colors = [
    { name: "Amber", gradient: "radial-gradient(circle, rgb(218, 179, 69) 1%, rgb(177, 128, 42) 80%)" },
    { name: "Aquamarine", gradient: "radial-gradient(circle, rgb(96, 177, 149) 1%, rgb(70, 171, 180) 80%)" },
    { name: "Azure Blue", gradient: "radial-gradient(circle, rgb(93, 177, 203) 1%, rgb(68, 139, 171) 80%)" },
    { name: "Battleship Grey", gradient: "radial-gradient(circle, rgb(140, 140, 133) 1%, rgb(108, 108, 102) 80%)" },
    { name: "Black", gradient: "radial-gradient(circle, rgb(54, 55, 56) 1%, rgb(14, 15, 15) 80%)" },
    { name: "Burgundy", gradient: "radial-gradient(circle, rgb(163, 94, 102) 1%, rgb(109, 65, 74) 80%)" }
  ]

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
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.showAlert('Добавление слота за 0.4 ₽')
    }
  }

  const addSubscription = () => {
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.showAlert('Добавление подписки')
    }
  }

  const handleColorSelect = (colorName) => {
    setSelectedColor(colorName)
    setShowColorPicker(false)
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
            onClick={() => setShowColorPicker(true)}
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

      {/* Модальное окно выбора цвета */}
      {showColorPicker && (
        <div className="modal-overlay" onClick={() => setShowColorPicker(false)}>
          <div className="color-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Выберите цвет</h3>
              <button 
                className="close-btn"
                onClick={() => setShowColorPicker(false)}
              >
                ×
              </button>
            </div>
            <div className="colors-list">
              {colors.map((color) => (
                <div
                  key={color.name}
                  className={`color-item ${selectedColor === color.name ? 'selected' : ''}`}
                  onClick={() => handleColorSelect(color.name)}
                >
                  <div 
                    className="color-preview"
                    style={{ background: color.gradient }}
                  ></div>
                  <span className="color-name">{color.name}</span>
                  {selectedColor === color.name && (
                    <div className="checkmark">✓</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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