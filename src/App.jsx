import { useEffect, useState } from 'react'

function App() {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Проверяем есть ли Telegram WebApp
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp
      
      // Расширяем на весь экран
      tg.expand()
      
      // Показываем кнопку "Назад"
      tg.BackButton.show()
      tg.BackButton.onClick(() => {
        window.history.back()
      })
      
      // Получаем данные пользователя
      const userData = tg.initDataUnsafe.user
      if (userData) {
        setUser({
          firstName: userData.first_name,
          lastName: userData.last_name,
          username: userData.username
        })
      }
    }
    
    setIsLoading(false)
  }, [])

  if (isLoading) {
    return <div className="loading">Загрузка...</div>
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Мое Mini App</h1>
        {user ? (
          <div className="user-info">
            <p>Привет, {user.firstName}!</p>
          </div>
        ) : (
          <div className="user-info">
            <p>Тестовый режим</p>
          </div>
        )}
      </header>
      
      <main className="app-main">
        <div className="card">
          <h2>Добро пожаловать!</h2>
          <p>Это ваше мини-приложение в Telegram</p>
          <button 
            className="primary-button"
            onClick={() => {
              if (window.Telegram && window.Telegram.WebApp) {
                window.Telegram.WebApp.showAlert('Привет из Mini App!')
              } else {
                alert('Привет из Mini App! (тестовый режим)')
              }
            }}
          >
            Нажми меня
          </button>
        </div>
      </main>
    </div>
  )
}

export default App