// Cross-checks capacitor.config.json against the Android Gradle config.
//
//     node tools/check-android.js
//
// WHY THIS EXISTS
//
// @capacitor-firebase/authentication declares its Google and Facebook SDKs
// `compileOnly` unless rgcfaIncludeGoogle / rgcfaIncludeFacebook are true in
// android/variables.gradle. compileOnly means the code compiles, the APK builds,
// CI goes green — and the classes are simply absent on the device.
//
// That would be survivable if it only broke the button. It does not. The
// plugin's constructor runs initAuthProviderHandlers() over the `providers`
// list from capacitor.config.json and eagerly news up a handler for each one,
// at plugin load, before anything is signed in:
//
//     if (providerList.contains(ProviderId.FACEBOOK))
//         facebookAuthProviderHandler = new FacebookAuthProviderHandler(this);
//
// The handler's own constructor wraps its work in `catch (Exception)` and
// Capacitor's PluginHandle.load() also catches `Exception` — but a missing
// class raises NoClassDefFoundError, which is an *Error*, not an Exception. It
// sails past both handlers, out of the Bridge constructor, out of
// BridgeActivity.onCreate. The app dies on the splash screen with no UI, no
// message, and nothing in the build log that hints at it.
//
// This is exactly what shipped: providers listed "facebook.com" while
// rgcfaIncludeFacebook was false, deliberately, because the Facebook app does
// not exist yet. One line of JSON, and the whole APK would not open.
//
// So: a provider may only be listed if the library backing it is actually
// packaged. Ten lines of check, in exchange for a class of bug whose only other
// symptom is "app open hoyei off hoye jacche".

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const failures = [];

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
const gradle = fs.readFileSync(path.join(ROOT, 'android', 'variables.gradle'), 'utf8');

// Providers whose handler needs a library that variables.gradle can exclude.
// Everything else (phone, oauth) rides on firebase-auth, which is always an
// `implementation` dependency and therefore always present.
const GATED = {
    'google.com': 'rgcfaIncludeGoogle',
    'facebook.com': 'rgcfaIncludeFacebook',
};

const flag = (name) => {
    const m = gradle.match(new RegExp(`^\\s*${name}\\s*=\\s*(true|false)`, 'm'));
    if (!m) {
        failures.push(`android/variables.gradle does not set ${name}`);
        return false;
    }
    return m[1] === 'true';
};

const providers = config.plugins?.FirebaseAuthentication?.providers || [];
for (const provider of providers) {
    const name = GATED[provider];
    if (!name) continue;
    if (!flag(name)) {
        failures.push(
            `capacitor.config.json lists provider "${provider}" but ${name} is false in ` +
            `android/variables.gradle.\n` +
            `     The SDK is compileOnly, so the handler this provider constructs at plugin\n` +
            `     load throws NoClassDefFoundError and THE APP CRASHES ON LAUNCH.\n` +
            `     Either flip the flag (and add the SDK's required resources), or drop the\n` +
            `     provider from the list until you do.`
        );
    }
}

// The icon named for FCM and local notifications has to exist as a drawable, or
// notification delivery fails at display time on the device only.
const iconNames = new Set();
const smallIcon = config.plugins?.LocalNotifications?.smallIcon;
if (smallIcon) iconNames.add(smallIcon);
const manifestPath = path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    for (const m of manifest.matchAll(/@drawable\/([A-Za-z0-9_]+)/g)) iconNames.add(m[1]);
}
const drawableDir = path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'drawable');
for (const icon of iconNames) {
    const found = fs.existsSync(drawableDir)
        && fs.readdirSync(drawableDir).some((f) => f.replace(/\.[^.]+$/, '') === icon);
    if (!found) {
        failures.push(`drawable "${icon}" is referenced but android/.../res/drawable/${icon}.* does not exist`);
    }
}

// The package name is a one-way door once Play has seen it: it must agree
// across all four places that spell it out.
const appId = config.appId;
const checks = [
    ['android/app/build.gradle', /applicationId\s+"([^"]+)"/],
    ['android/app/build.gradle', /namespace\s+"([^"]+)"/],
    ['android/app/src/main/res/values/strings.xml', /<string name="package_name">([^<]+)</],
    ['android/app/src/main/res/values/strings.xml', /<string name="custom_url_scheme">([^<]+)</],
];
for (const [rel, re] of checks) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const m = fs.readFileSync(file, 'utf8').match(re);
    if (m && m[1] !== appId) {
        failures.push(`${rel}: "${m[1]}" does not match capacitor.config.json appId "${appId}"`);
    }
}

if (failures.length) {
    console.error(`\n❌ ${failures.length} Android config problem(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}

console.log(`✅ Android config consistent — providers [${providers.join(', ')}] all have their libraries packaged.`);
