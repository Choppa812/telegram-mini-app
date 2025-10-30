import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { connector, generateConnectUrl } from '../ton-connect';

function WalletConnectModal({ onClose, onWalletConnected }) {
  const [currentStep, setCurrentStep] = useState('wallet-selection');
  const [universalLink, setUniversalLink] = useState('');
  const [telegramLink, setTelegramLink] = useState('');

  useEffect(() => {
    initializeConnection();
  }, []);

  const initializeConnection = async () => {
    try {
      const universalUrl = await generateConnectUrl(connector);
      setUniversalLink(universalUrl);
      
      // Генерация ссылки для Telegram Wallet
      const tgWalletLink = `https://t.me/wallet/start?startapp=${btoa(universalUrl)}`;
      setTelegramLink(tgWalletLink);
    } catch (error) {
      console.error('Error generating connection URL:', error);
    }
  };

  const handleTelegramWalletClick = () => {
    setCurrentStep('telegram-wallet');
  };

  const handleBackToSelection = () => {
    setCurrentStep('wallet-selection');
  };

  const handleOpenInTelegram = () => {
    window.open(telegramLink, '_blank');
  };

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
                <QRCodeSVG value={universalLink} size={200} />
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
                <QRCodeSVG value={telegramLink} size={200} />
                <p>Scan QR code to open in Telegram</p>
              </div>
            )}
            
            <button className="tg-wallet-btn" onClick={handleOpenInTelegram}>
              Connect Wallet in Telegram on desktop
            </button>
            
            <p className="wallet-note">
              This will open Telegram Wallet where you can approve the connection
            </p>
          </div>
        </div>
      </div>
    );
  }
}

export default WalletConnectModal;