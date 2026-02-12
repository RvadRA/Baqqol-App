import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { NotificationProvider } from './context/NotificationContext';
import "./index.css";

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('✅ Service Worker registered:', registration.scope);
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          console.log('🔄 Service Worker update found');
          
          if (installingWorker) {
            installingWorker.addEventListener('statechange', () => {
              console.log('📦 Service Worker state:', installingWorker.state);
            });
          }
        });
      })
      .catch((error) => {
        console.error('❌ Service Worker registration failed:', error);
      });
  });
}

// Check for PWA updates
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      console.log('🔄 New version available, reloading...');
      window.location.reload();
    }
  });
}

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <AuthProvider>
    <NotificationProvider>
      <App />
    </NotificationProvider>
  </AuthProvider>
);