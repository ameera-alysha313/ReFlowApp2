// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, getFirestore, Firestore } from 'firebase/firestore';
// @ts-ignore
import { initializeAuth, getReactNativePersistence, getAuth, Auth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

import { getAI, getGenerativeModel, GoogleAIBackend } from "firebase/ai"

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC7Vt-181BCbpeyoPcix2Eqg4YA1Em0KwA",
  authDomain: "refloapp-aaa67.firebaseapp.com",
  projectId: "refloapp-aaa67",
  storageBucket: "refloapp-aaa67.firebasestorage.app",
  messagingSenderId: "347124957340",
  appId: "1:347124957340:web:5aa53bd0ad1650d29cad59",
};

// Initialize Firebase

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function createDb(): Firestore {
  try {
    return initializeFirestore(app, { ignoreUndefinedProperties: true });
  } catch {
    return getFirestore(app);
  }
}

function createAuth(): Auth {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    return getAuth(app);
  }
}

export const db = createDb();
export const auth = createAuth();
// For more information on how to access Firebase in your project,
// see the Firebase documentation: https://firebase.google.com/docs/web/setup#access-firebase
