import  { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || 
        (window.navigator as any).standalone === true) {
      setIsInstalled(true);
      return;
    }

    // Check if iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      
      // Check if we should show the prompt
      const hasDismissed = localStorage.getItem('pwa-prompt-dismissed');
      const lastPrompt = localStorage.getItem('pwa-prompt-last');
      const now = Date.now();
      
      // Show if never dismissed or last prompt was more than 7 days ago
      if (!hasDismissed || (lastPrompt && now - parseInt(lastPrompt) > 7 * 24 * 60 * 60 * 1000)) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Detect install
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowPrompt(false);
      localStorage.removeItem('pwa-prompt-dismissed');
      localStorage.removeItem('pwa-prompt-last');
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;

    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      
      setInstallPrompt(null);
      setShowPrompt(false);
    } catch (error) {
      console.error('Error installing PWA:', error);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-prompt-dismissed', 'true');
    localStorage.setItem('pwa-prompt-last', Date.now().toString());
  };

  if (isInstalled || !showPrompt) return null;

  // iOS specific prompt
  if (isIOS) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-50 lg:bottom-8 lg:left-1/2 lg:right-auto lg:transform lg:-translate-x-1/2 lg:w-96 animate-slide-up">
        <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 shadow-2xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xl">B</span>
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <h3 className="text-lg font-semibold text-white">Установить BaqqolApp</h3>
                <button 
                  onClick={handleDismiss}
                  className="p-1 text-gray-400 hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-300 mt-1">
                Установите приложение на ваш iPhone для быстрого доступа
              </p>
              <div className="mt-3 flex items-center gap-2 text-sm text-gray-400">
                <span>1. Нажмите</span>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <rect x="4" y="2" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  <circle cx="10" cy="14" r="1" fill="currentColor"/>
                </svg>
                <span>2. "На экран 'Домой'"</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Android/Desktop prompt
  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 lg:bottom-8 lg:left-1/2 lg:right-auto lg:transform lg:-translate-x-1/2 lg:w-96 animate-slide-up">
      <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-5 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0">
            <Download className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold text-white">Установить приложение</h3>
              <button 
                onClick={handleDismiss}
                className="p-1 text-gray-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-300 mt-1">
              Установите BaqqolApp на ваш телефон для быстрого доступа и офлайн-режима
            </p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleInstallClick}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl text-sm font-semibold hover:from-purple-700 hover:to-blue-700 transition-colors"
              >
                Установить
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2.5 bg-slate-800/50 text-gray-300 rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors"
              >
                Не сейчас
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}