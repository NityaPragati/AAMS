# AAMS Attendance Mobile App

This is a React Native / Expo app that lets a student scan the teacher's rotating QR code and mark attendance.

## Features
- Student login
- QR camera scanner
- Attendance submission to the existing backend
- Success / error feedback

## Backend API
The app talks to:
- `POST /api/auth/login`
- `POST /api/attendance/qr/scan`

## Run locally
Install dependencies and start Expo:

```bash
cd "AAMS/App"
npm install
npm start
```

## API URL
Set the backend URL for your device if needed:

```bash
# Android emulator default
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000

# Physical device or custom host
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:8000
```

## Test account
Use an existing student account from the main project, for example:
- `student1@lpu.edu`
- `student123`
