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

// Facebook sign-in needs a Facebook app before it can work — an App ID and a
// client token on the Facebook side, the provider switched on in Firebase, and
// on Android the login SDK compiled in (rgcfaIncludeFacebook in
// android/variables.gradle). Until all of that is done the button stays hidden,
// because a login button that always errors costs more trust than a missing one
// costs convenience. Set this to true as the last step. See
// docs/facebook-login.md.
window.FACEBOOK_ENABLED = false;
