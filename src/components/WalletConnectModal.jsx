import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { connector, generateConnectUrl, generateTelegramWalletLink } from '../ton-connect';

function WalletConnectModal({ onClose, onWalletConnected }) {
  const [currentStep, setCurrentStep] = useState('wallet-selection');
  const [universalLink, setUniversalLink] = useState('');
  const [telegramLink, setTelegramLink] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeConnection();
  }, []);

  const initializeConnection = async () => {
    try {
      setIsLoading(true);
      const universalUrl = await generateConnectUrl();
      setUniversalLink(universalUrl);
      
      // Генерация правильной ссылки для Telegram Wallet
      const tgLink = generateTelegramWalletLink(universalUrl);
      setTelegramLink(tgLink);
    } catch (error) {
      console.error('Error generating connection URL:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTelegramWalletClick = () => {
    setCurrentStep('telegram-wallet');
  };

  const handleBackToSelection = () => {
    setCurrentStep('wallet-selection');
  };

  const handleOpenInTelegram = () => {
    // Открываем ссылку в новом окне/вкладке
    window.open(telegramLink, '_blank', 'noopener,noreferrer');
  };

  // Показываем загрузку
  if (isLoading) {
    return (
      <div className="modal-overlay">
        <div className="wallet-connect-modal">
          <div className="modal-header">
            <h3>Connect Wallet</h3>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          <div className="loading-section">
            <p>Generating connection...</p>
          </div>
        </div>
      </div>
    );
  }
import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { connector, generateConnectUrl, generateTelegramWalletLink } from '../ton-connect';

function WalletConnectModal({ onClose, onWalletConnected }) {
  const [currentStep, setCurrentStep] = useState('wallet-selection');
  const [universalLink, setUniversalLink] = useState('');
  const [telegramLink, setTelegramLink] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeConnection();
  }, []);

  const initializeConnection = async () => {
    try {
      setIsLoading(true);
      const universalUrl = await generateConnectUrl();
      setUniversalLink(universalUrl);
      
      const tgLink = generateTelegramWalletLink(universalUrl);
      setTelegramLink(tgLink);
    } catch (error) {
      console.error('Error generating connection URL:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTelegramWalletClick = () => {
    setCurrentStep('telegram-wallet');
  };

  const handleBackToSelection = () => {
    setCurrentStep('wallet-selection');
  };

  const handleOpenInTelegram = () => {
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.openInvoice(telegramLink, (status) => {
        if (status === 'paid') {
          console.log('Payment successful');
          onWalletConnected();
        } else if (status === 'failed') {
          console.log('Payment failed');
        } else if (status === 'cancelled') {
          console.log('Payment cancelled');
        }
      });
    } else {
      window.open(telegramLink, '_blank', 'noopener,noreferrer');
    }
  };

  if (isLoading) {
    return (
      <div className="modal-overlay">
        <div className="wallet-connect-modal">
          <div className="modal-header">
            <h3>Connect Wallet</h3>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          <div className="loading-section">
            <p>Generating connection...</p>
          </div>
        </div>
      </div>
    );
  }

  if (currentStep === 'wallet-selection') {
    return (
      <div className="modal-overlay">
        <div className="wallet-connect-modal">
          <div className="modal-header">
            <h3>Connect Wallet</h3>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          
          <div className="wallet-options">
            <div className="wallet-option" onClick={handleTelegramWalletClick}>
              <div className="wallet-icon">💎</div>
              <div className="wallet-info">
                <h4>Telegram Wallet</h4>
                <p>Connect using Telegram built-in wallet</p>
              </div>
              <div className="arrow">→</div>
            </div>
            
            {universalLink && (
              <div className="qr-section">
                <p>Scan QR code with any TON wallet</p>
                <QRCodeSVG 
                  value={universalLink} 
                  size={200}
                  level="M"
                  includeMargin={true}
                />
                <p className="qr-note">Or copy this link: {universalLink.substring(0, 30)}...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (currentStep === 'telegram-wallet') {
    return (
      <div className="modal-overlay">
        <div className="wallet-connect-modal">
          <div className="modal-header">
            <button className="back-btn" onClick={handleBackToSelection}>←</button>
            <h3>Connect Telegram Wallet</h3>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          
          <div className="telegram-wallet-content">
            {telegramLink && (
              <div className="qr-section">
                <QRCodeSVG 
                  value={telegramLink} 
                  size={200}
                  level="M"
                  includeMargin={true}
                />
                <p>Scan QR code to open Telegram Wallet</p>
              </div>
            )}
            
            <button className="tg-wallet-btn" onClick={handleOpenInTelegram}>
              💎 Open Telegram Wallet
            </button>
            
            <div className="wallet-steps">
              <h4>How to connect:</h4>
              <ol>
                <li>Click the button above</li>
                <li>Telegram Wallet will open</li>
                <li>Approve the connection request</li>
                <li>Return to this app</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default WalletConnectModal;
  if (currentStep === 'wallet-selection') {
    return (
      <div className="modal-overlay">
        <div className="wallet-connect-modal">
          <div className="modal-header">
            <h3>Connect Wallet</h3>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          
          <div className="wallet-options">
            <div className="wallet-option" onClick={handleTelegramWalletClick}>
              <div className="wallet-icon">💎</div>
              <div className="wallet-info">
                <h4>Telegram Wallet</h4>
                <p>Connect using Telegram built-in wallet</p>
              </div>
              <div className="arrow">→</div>
            </div>
            
            {universalLink && (
              <div className="qr-section">
                <p>Scan QR code with any TON wallet</p>
                <QRCodeSVG 
                  value={universalLink} 
                  size={200}
                  level="M"
                  includeMargin={true}
                />
                <p className="qr-note">Or copy this link: {universalLink.substring(0, 30)}...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (currentStep === 'telegram-wallet') {
    return (
      <div className="modal-overlay">
        <div className="wallet-connect-modal">
          <div className="modal-header">
            <button className="back-btn" onClick={handleBackToSelection}>←</button>
            <h3>Connect Telegram Wallet</h3>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          
          <div className="telegram-wallet-content">
            {telegramLink && (
              <div className="qr-section">
                <QRCodeSVG 
                  value={telegramLink} 
                  size={200}
                  level="M"
                  includeMargin={true}
                />
                <p>Scan QR code to open Telegram Wallet</p>
              </div>
            )}
            
            <button className="tg-wallet-btn" onClick={handleOpenInTelegram}>
              💎 Open Telegram Wallet
            </button>
            
            <div className="wallet-steps">
              <h4>How to connect:</h4>
              <ol>
                <li>Click the button above</li>
                <li>Telegram Wallet will open</li>
                <li>Approve the connection request</li>
                <li>Return to this app</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default WalletConnectModal;