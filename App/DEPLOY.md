# Mobile App (Expo) Deployment

This is an Expo-managed React Native app. You can run it in Expo Go for development or build production binaries with EAS.

Environment variables (set at build/deploy time):

- `EXPO_PUBLIC_API_URL` — Base URL of the backend API (example: `https://aams-production.up.railway.app` or `http://YOUR_HOST:8000`)

Development:

```bash
cd App
npm install
npm start
# Scan the QR with Expo Go or use `expo start --tunnel` for a physical device across networks
```

Production build with EAS:

1. Install EAS CLI: `npm install -g eas-cli`
2. Login: `eas login`
3. Configure `eas.json` (add build profile)
4. Set `EXPO_PUBLIC_API_URL` in your EAS build environment or use runtime config
5. Run `eas build --platform android` or `eas build --platform ios`
