// ==========================================================================
// FIREBASE OFFLINE STANDALONE ENTRY BUNDLER
// Exports only the modules required by Restaurant ERP
// ==========================================================================

// 1. Firebase Core App
export { initializeApp, deleteApp } from "firebase/app";

// 2. Firebase Authentication
export { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from "firebase/auth";

// 3. Firebase Realtime Database
export { 
  getDatabase, 
  ref, 
  set, 
  get, 
  push, 
  update, 
  remove, 
  onValue,
  query,
  orderByChild,
  startAt,
  endAt,
  limitToLast,
  equalTo,
  runTransaction
} from "firebase/database";
