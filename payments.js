// Merchant numbers for the manual bKash/Nagad/Rocket purchase flow.
//
// This file is copied into the WEB build only. Google Play forbids selling
// digital goods through anything but Play Billing, and forbids pointing users
// at an outside purchase path — so a reviewer unzipping the APK must not find
// a merchant number in it. Keeping these out of app.js is what makes that
// guarantee structural rather than a promise.
//
// app.js reads them through window.PAYMENT_* and treats "absent" as "this
// build does not sell anything".
window.PAYMENT_BKASH  = '01886608999';
window.PAYMENT_NAGAD  = '01886608999';
window.PAYMENT_ROCKET = '01886608999';
