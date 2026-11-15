import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User as FirebaseUser,
} from 'firebase/auth';

const firebaseConfig = {
  projectId: 'gen-lang-client-0927812338',
  appId: '1:950856786369:web:d1d4db108d5b4bbd00cf40',
  apiKey: 'AIzaSyCpAM71JkySQfFETfihVi6ezH5WREe6s_Y',
  authDomain: 'gen-lang-client-0927812338.firebaseapp.com',
  storageBucket: 'gen-lang-client-0927812338.firebasestorage.app',
  messagingSenderId: '950856786369',
};

export const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const googleAuthProvider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  googleAuthProvider.addScope(scope);
}
googleAuthProvider.setCustomParameters({
  prompt: 'consent',
});

// In-memory cache for the Google Workspace OAuth access token (never stored in localStorage/sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
  if (!firebaseUser && !isSigningIn) {
    cachedAccessToken = null;
  }
});

export const getGmailAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const setGmailAccessToken = (token: string | null): void => {
  cachedAccessToken = token;
};

export const clearGmailAccessToken = (): void => {
  cachedAccessToken = null;
};

/**
 * Initiates Google Sign-In popup requesting the Gmail send scope and caches the OAuth access token in memory.
 * Must be invoked directly from a user click handler so browsers never block the popup.
 */
export const connectGmailWithPopup = async (): Promise<{
  user: FirebaseUser;
  accessToken: string;
  idToken: string;
}> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleAuthProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Không lấy được quyền truy cập Gmail từ Google OAuth.');
    }
    const idToken = await result.user.getIdToken();
    cachedAccessToken = credential.accessToken;
    return {
      user: result.user,
      accessToken: cachedAccessToken,
      idToken,
    };
  } finally {
    isSigningIn = false;
  }
};
