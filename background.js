const SESSION_COOKIE_NAME = 'ppyauth';
const TARGET_DOMAINS = [
  'https://www.yorku.ca/',
  'https://passportyork.yorku.ca/',
  'https://my.yorku.ca/',
  'https://w2prod.sis.yorku.ca/'
];

async function isUserLoggedIn() {
  try {
    console.log('--- DEBUGGING COOKIES ---');

    for (const domain of TARGET_DOMAINS) {
      console.log(`\n🔍 Checking cookies for: ${domain}`);

      const cookies = await chrome.cookies.getAll({ url: domain });

      console.log(`Found ${cookies.length} cookies for ${domain}`);
      cookies.forEach((cookie, index) => {
        console.log(`  ${index + 1}. ${cookie.name} = ${cookie.value.substring(0, 30)}...`);
      });

      const sessionCookie = cookies.find(c => c.name === SESSION_COOKIE_NAME);

      if (sessionCookie) {
        console.log(`✅ SUCCESS: Found ${SESSION_COOKIE_NAME} at ${domain}`);
        console.log('Full cookie object:', sessionCookie);
        return true;
      }
    }

    console.log('❌ FAILURE: No session cookie found in any tested domain.');
    return false;

  } catch (error) {
    console.error('💥 ERROR in cookie check:', error);
    return false;
  }
}

// Listen for content script requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkLoginStatus") {
    isUserLoggedIn().then(isLoggedIn => {
      sendResponse({ status: isLoggedIn });
    });
    return true;
  }
});
