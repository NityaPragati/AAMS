# 📱 AAMS — Automated Attendance Management System

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Expo](https://img.shields.io/badge/Expo-54.0-black?logo=expo)](https://expo.dev)
[![React](https://img.shields.io/badge/React-18.0-blue?logo=react)](https://reactjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100-green?logo=fastapi)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.10-blue?logo=python)](https://python.org)

> **Premium AI-Powered Attendance Management System.** A full-stack platform featuring real-time face recognition, anti-spoofing, QR attendance, advanced analytics, and a seamless mobile experience.

---

## 🌟 Key Features

### 🛡️ 4-Stage AI Pipeline
Our proprietary authentication pipeline ensures 99% accuracy and prevents fraud via:
1.  **Face Detection**: Using MediaPipe 3D Face Mesh (468 landmarks).
2.  **Liveness Detection**: Multi-layered anti-spoofing (LBP, FFT, Skin Chrominance, Blink detection).
3.  **Pose Estimation**: Ensures students are looking directly at the camera.
4.  **Face Recognition**: FaceNet-based 128-dimensional embedding matching.

### 🏫 Institutional Management
*   **Role-Based Dashboards**: Customized interfaces for Admins, Teachers, and Students.
*   **Smart Sectioning**: Dynamic classroom allocation and teacher assignment.
*   **Multi-Modal Attendance**:
    *   ✨ **Face Recognition**: Real-time biometric verification.
    *   🎟️ **Dynamic QR Codes**: 90-second single-use tokens to prevent screenshot sharing.
    *   📝 **Manual Override**: For exceptional cases with full audit trails.

### 📊 Insights & Alerts
*   **Student Portal**: Real-time attendance tracking with circular progress indicators.
*   **Threshold Alerts**: Automated email and push notifications when attendance drops below 75%.
*   **Analytics**: Detailed CSV exports and trend charts for faculty.

---

## 🏗️ System Architecture

AAMS is built with a modern 3-tier architecture:

| Tier | Technology | Description |
| :--- | :--- | :--- |
| **Mobile** | `React Native (Expo)` | Cross-platform student and teacher application. |
| **Web** | `React.js` | Premium administrative and dashboard interface. |
| **API** | `FastAPI (Python)` | Asynchronous AI pipeline and data management. |
| **Backend** | `Node.js (Express)` | Primary business logic and auth gateway. |
| **Database** | `PostgreSQL` | Relational storage with `pgvector` for embeddings. |

---

## 🚀 Quick Start

### 1. Prerequisites
*   Node.js (v18+)
*   Python (3.10+)
*   PostgreSQL Instance

### 2. Setup Components

#### 💾 Backend API
```bash
cd backend
npm install
npm start
```

#### 🐍 AI Service
```bash
cd ai
pip install -r requirements.txt
python main.py
```

#### 📱 Mobile App (Expo)
```bash
cd App
npm install
npx expo start
```

#### 💻 Web Dashboard
```bash
cd frontend
npm install
npm start
```

---

## 📄 Documentation

For detailed installation and deployment guides, refer to:
*   [Backend Deployment Guide](backend/DEPLOY.md)
*   [Mobile App Setup](App/DEPLOY.md)
*   [Frontend Documentation](frontend/README.md)
*   [AI Model Details](ai/README.md)

---

## 🤝 Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 🔒 Security

For security vulnerabilities, please refer to our [SECURITY.md](SECURITY.md).

## ⚖️ License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Developed with ❤️ by <b>Project Group 2RGC0646</b><br/>
  <i>Lovely Professional University</i>
</p>
