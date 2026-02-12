const CACHE_NAME = 'baqqolapp-v1';
const DYNAMIC_CACHE = 'baqqolapp-dynamic-v1';
const API_CACHE = 'baqqolapp-api-v1';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/src/main.tsx',
  '/src/index.css'
];

// Install event
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME && key !== DYNAMIC_CACHE && key !== API_CACHE) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Helper function to determine if request is API
const isApiRequest = (url) => {
  return url.includes('/api/') || url.includes('localhost:5000');
};

// Helper function to determine if request is static asset
const isStaticAsset = (url) => {
  return url.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|json|woff|woff2|ttf|eot)$/);
};

// Fetch event - Network First with fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle API requests
  if (isApiRequest(url.href)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses
          if (response.status === 200) {
            const clonedResponse = response.clone();
            caches.open(API_CACHE).then((cache) => {
              cache.put(request, clonedResponse);
            });
          }
          return response;
        })
        .catch(() => {
          // Return cached API response if available
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return offline message for API
            return new Response(
              JSON.stringify({ 
                message: 'Вы офлайн. Некоторые данные могут быть недоступны.',
                offline: true 
              }),
              {
                headers: { 'Content-Type': 'application/json' },
                status: 503,
                statusText: 'Service Unavailable'
              }
            );
          });
        })
    );
    return;
  }

  // Handle static assets
  if (isStaticAsset(url.href)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        return cachedResponse || fetch(request).then((response) => {
          return caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // Handle navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          return response;
        })
        .catch(() => {
          return caches.match('/offline.html');
        })
    );
    return;
  }

  // Default strategy: Network First with Cache Fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const clonedResponse = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, clonedResponse);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          return cachedResponse || caches.match('/offline.html');
        });
      })
  );
});

// Background Sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background Sync', event.tag);
  
  if (event.tag === 'sync-debts') {
    event.waitUntil(syncDebts());
  }
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received', event);
  
  let notificationData = {};
  
  try {
    notificationData = event.data.json();
  } catch (e) {
    notificationData = {
      title: 'BaqqolApp',
      body: event.data.text(),
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png'
    };
  }

  const options = {
    ...notificationData,
    icon: notificationData.icon || '/icons/icon-192x192.png',
    badge: notificationData.badge || '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      url: notificationData.url || '/dashboard',
      dateOfArrival: Date.now(),
      ...notificationData.data
    },
    actions: notificationData.actions || [
      {
        action: 'open',
        title: 'Открыть'
      },
      {
        action: 'close',
        title: 'Закрыть'
      }
    ],
    tag: notificationData.tag || 'default',
    renotify: true,
    requireInteraction: true,
    silent: false
  };

  event.waitUntil(
    self.registration.showNotification(
      notificationData.title || 'BaqqolApp',
      options
    )
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click', event);
  
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const urlToOpen = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      // Check if there's already a window/tab open with the target URL
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window/tab
      return clients.openWindow(urlToOpen);
    })
  );
});

// Helper functions for background sync
async function syncDebts() {
  try {
    const db = await openIndexedDB();
    const offlineDebts = await getOfflineDebts(db);
    
    for (const debt of offlineDebts) {
      const response = await fetch('/api/debts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getToken()}`
        },
        body: JSON.stringify(debt)
      });
      
      if (response.ok) {
        await removeOfflineDebt(db, debt.id);
      }
    }
  } catch (error) {
    console.error('[Service Worker] Error syncing debts:', error);
  }
}

async function syncMessages() {
  try {
    const db = await openIndexedDB();
    const offlineMessages = await getOfflineMessages(db);
    
    for (const message of offlineMessages) {
      const response = await fetch(`/api/chats/${message.chatId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getToken()}`
        },
        body: JSON.stringify(message)
      });
      
      if (response.ok) {
        await removeOfflineMessage(db, message.id);
      }
    }
  } catch (error) {
    console.error('[Service Worker] Error syncing messages:', error);
  }
}

// IndexedDB helpers
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('BaqqolAppOfflineDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('offlineDebts')) {
        db.createObjectStore('offlineDebts', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('offlineMessages')) {
        db.createObjectStore('offlineMessages', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('auth')) {
        db.createObjectStore('auth');
      }
    };
  });
}

async function getToken() {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['auth'], 'readonly');
    const store = transaction.objectStore('auth');
    const request = store.get('token');
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function getOfflineDebts(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['offlineDebts'], 'readonly');
    const store = transaction.objectStore('offlineDebts');
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function removeOfflineDebt(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['offlineDebts'], 'readwrite');
    const store = transaction.objectStore('offlineDebts');
    const request = store.delete(id);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function getOfflineMessages(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['offlineMessages'], 'readonly');
    const store = transaction.objectStore('offlineMessages');
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function removeOfflineMessage(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['offlineMessages'], 'readwrite');
    const store = transaction.objectStore('offlineMessages');
    const request = store.delete(id);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}