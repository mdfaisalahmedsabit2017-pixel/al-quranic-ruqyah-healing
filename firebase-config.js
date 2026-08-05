// Get these values from https://console.firebase.google.com
// Project Settings → Your apps → Web app → SDK setup and configuration
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBQyGnY8DhqdlTpOIwfZC6FZWqvOmwGDh8",
    authDomain: "al-quranic-ruqyah.firebaseapp.com",
    projectId: "al-quranic-ruqyah",
    storageBucket: "al-quranic-ruqyah.firebasestorage.app",
    messagingSenderId: "500893735095",
    appId: "1:500893735095:web:26c992d1b3eab5934a9532"
};

// ── Which ways in are offered ───────────────────────────────────────────────
//
// v1.0 ships Google and email/password only. The phone and Facebook flows are
// written, tested and switched off — each carries a setup cost that has to be
// paid before it can work at all, and a sign-in button that always fails costs
// more trust than a missing one costs convenience.
//
// Flipping either to true is the LAST step of its setup, not the first.

// Needs: Firebase Authentication -> Sign-in method -> Phone -> Enable, and the
// project on the Blaze plan (each SMS is billed, roughly $0.01-0.05 to a
// Bangladeshi number). Set a daily SMS cap in the console at the same time.
// See docs/firebase-android.md §৩ক.
window.PHONE_LOGIN_ENABLED = false;

// Needs: a Facebook app (App ID + client token), the provider enabled in
// Firebase, facebook.xml in the Android resources, and rgcfaIncludeFacebook
// flipped in android/variables.gradle — in that order. Turning the Gradle flag
// on before the resources exist crashes the app at launch.
// See docs/facebook-login.md.
window.FACEBOOK_ENABLED = false;
