// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCBX3AQ5o2UXsexEOlc1Ry4ACtU51BpbAU",
  authDomain: "moritz-cd1e1.firebaseapp.com",
  projectId: "moritz-cd1e1",
  storageBucket: "moritz-cd1e1.firebasestorage.app",
  messagingSenderId: "94965148399",
  appId: "1:94965148399:web:470de83e0439d8995cc91a",
  measurementId: "G-JZDKP8P0MW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
