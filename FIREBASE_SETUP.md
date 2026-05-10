# Firebase + Android 셋업

이 프로젝트는 Firebase Cloud Functions를 통해 Gemini 2.5 Flash-Lite를 호출하고,
Capacitor로 Android Studio 프로젝트를 생성합니다.

---

## 0. 사전 준비

- Node.js 20 이상
- Firebase CLI: `npm i -g firebase-tools`
- Firebase 프로젝트: **`ai-album-app`** (이미 존재해야 함)

```bash
firebase login
firebase use ai-album-app
```

---

## 1. Cloud Functions 배포

```bash
cd functions
npm install
cd ..

# Gemini API 키를 Functions secret에 등록 (한 번만)
firebase functions:secrets:set GEMINI_API_KEY
# > 키 입력 후 엔터

firebase deploy --only functions,firestore
```

배포되는 callable 함수:

| 이름            | 역할                                                             |
| --------------- | ---------------------------------------------------------------- |
| `chat`          | 인터뷰 대화 (Gemini 스트리밍, 사진당 최대 3턴)                  |
| `generateAlbum` | 최종 앨범 JSON 생성 + 하루 1앨범 카운터 atomic 증가              |
| `dailyStatus`   | 오늘 사용 횟수 조회                                              |

세 함수 모두 **App Check 강제**(`enforceAppCheck: true`).

---

## 2. App Check (Play Integrity)

### Firebase Console
1. Build → App Check → 앱 등록
2. **Android 앱**: Play Integrity 공급자 활성화 (SHA-256 지문 등록 필요)
3. (선택) 웹 앱: reCAPTCHA v3 site key 발급 → `VITE_RECAPTCHA_V3_SITE_KEY` 로 주입

### 디버그 토큰 (개발 중)
브라우저 콘솔에서 `firebase.appCheck()`를 처음 호출할 때 출력되는 디버그 토큰을
Console → App Check → 앱 → 디버그 토큰 관리에 등록한 뒤,
`.env.local`에 다음 추가:

```
VITE_APPCHECK_DEBUG_TOKEN=<발급받은-토큰>
```

---

## 3. 웹 앱 환경 변수

`.env.local`에 Firebase 웹 config을 채웁니다 (Console → 프로젝트 설정 → 일반):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=ai-album-app.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=ai-album-app
VITE_FIREBASE_STORAGE_BUCKET=ai-album-app.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_RECAPTCHA_V3_SITE_KEY=...   # 웹 App Check용 (선택)
```

---

## 4. Android Studio 프로젝트 생성

```bash
npm run build
npx cap add android        # 최초 1회
npx cap sync android
```

이후 매번:
```bash
npm run build && npx cap sync android
npx cap open android       # Android Studio 실행
```

### `google-services.json` 위치
1. Firebase Console → 프로젝트 설정 → Android 앱 추가
   - 패키지명: **`app.lovable.aialbum`** (capacitor.config.ts와 일치)
   - 디버그 SHA-1 등록
2. 다운받은 `google-services.json`을 다음 경로에 넣기:
   ```
   android/app/google-services.json
   ```
3. `android/build.gradle`의 buildscript dependencies에 추가:
   ```
   classpath 'com.google.gms:google-services:4.4.2'
   ```
4. `android/app/build.gradle` 맨 아래에 추가:
   ```
   apply plugin: 'com.google.gms.google-services'

   dependencies {
     implementation platform('com.google.firebase:firebase-bom:33.5.1')
     implementation 'com.google.firebase:firebase-appcheck-playintegrity'
   }
   ```
5. Capacitor MainActivity에서 App Check 초기화:
   ```kotlin
   FirebaseApp.initializeApp(this)
   FirebaseAppCheck.getInstance().installAppCheckProviderFactory(
     PlayIntegrityAppCheckProviderFactory.getInstance()
   )
   ```

---

## 5. 동작 방식

```
[Android WebView/브라우저]
        │ httpsCallable + App Check 토큰
        ▼
[Cloud Function: chat / generateAlbum]
        │ enforceAppCheck → 토큰 검증
        │ Firestore daily_limits/{appId} atomic 증가
        │ GEMINI_API_KEY (server-only)
        ▼
[Gemini 2.5 Flash-Lite REST API]
```

- **API 키는 클라이언트 번들에 절대 노출되지 않음**
- **하루 1앨범 제한**은 Firestore 트랜잭션으로 강제 (App Check appId 또는 deviceId 키)
- ZIP 백업은 기존대로 로컬 (`idb-keyval` + `jszip`), 서버 스토리지 미사용
