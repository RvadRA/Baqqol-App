// service-worker.js
const CACHE_NAME = 'baqqol-chat-v1';
const API_CACHE_NAME = 'baqqol-api-v1';

// Файлы для кэширования
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  // Добавьте пути к вашим основным файлам
];

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('Service Worker: Installation complete');
        return self.skipWaiting();
      })
  );
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Activation complete');
      return self.clients.claim();
    })
  );
});

// Стратегия кэширования: Network First для API, Cache First для статики
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Для API запросов используем стратегию "Network First, then Cache"
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Клонируем ответ, чтобы использовать его и сохранить в кэш
          const responseClone = response.clone();
          
          caches.open(API_CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          
          return response;
        })
        .catch(() => {
          // Если сеть недоступна, пытаемся взять из кэша
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // Если нет в кэше, возвращаем заглушку
            if (url.pathname.includes('/chats/') && url.pathname.includes('/messages')) {
              return new Response(JSON.stringify({
                success: false,
                message: 'Offline mode',
                data: []
              }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }
            
            return new Response('Offline mode', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
        })
    );
  } else {
    // Для статических файлов используем стратегию "Cache First"
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          return fetch(event.request)
            .then((response) => {
              // Не кэшируем неподходящие ответы
              if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
              }
              
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
              
              return response;
            });
        })
    );
  }
});

// Фоновая синхронизация
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync', event.tag);
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncOfflineMessages());
  }
});

// Функция для синхронизации офлайн сообщений
async function syncOfflineMessages() {
  console.log('Service Worker: Syncing offline messages');
  
  try {
    const cache = await caches.open(API_CACHE_NAME);
    const keys = await cache.keys();
    
    const offlineRequests = keys.filter(request => 
      request.url.includes('/chats/') && 
      request.url.includes('/messages') && 
      request.method === 'POST'
    );
    
    for (const request of offlineRequests) {
      try {
        const response = await fetch(request.clone());
        
        if (response.ok) {
          // Удаляем успешно синхронизированный запрос из кэша
          await cache.delete(request);
          console.log('Successfully synced offline message');
        }
      } catch (error) {
        console.error('Failed to sync message:', error);
      }
    }
  } catch (error) {
    console.error('Sync error:', error);
  }
}

// Получение push-уведомлений
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  
  const options = {
    body: data.message || 'Новое сообщение',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.chatId || 'chat-notification',
    data: {
      url: data.chatId ? `/chats/${data.chatId}` : '/'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Baqqol App', options)
  );
});

// Клик по уведомлению
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});