# Baqqol-App
# 🛒 Baqqol App

![React](https://img.shields.io/badge/Frontend-React-blue)
![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue)
![Node](https://img.shields.io/badge/Backend-Node.js-green)
![MongoDB](https://img.shields.io/badge/Database-MongoDB-darkgreen)
![Socket.io](https://img.shields.io/badge/Realtime-Socket.io-black)
![PWA](https://img.shields.io/badge/App-PWA-purple)
## 🏗 Architecture
User (Browser / PWA)
        ↓
Frontend (React + Vite)
        ↓ REST API + Socket.io
Backend (Node + Express)
        ↓
MongoDB Atlas

---

## ✅ 1.3 API Documentation


## 📡 API Endpoints

### Auth
POST /api/auth/signup  
POST /api/auth/login  

### Customers
GET /api/customers  
POST /api/customers  

### Debts
GET /api/debts  
POST /api/debts  
PUT /api/debts/:id  

### Chat (Realtime)
Socket.io connection
## 📸 Screenshots

![Dashboard](./screenshots/dashboard.png)
![Debts](./screenshots/debts.png)
