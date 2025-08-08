// background.js

const SESSION_COOKIE_NAME = 'pyauth'; // Fixed: was 'ppyauth'
const TARGET_DOMAINS = [
  'https://yorku.ca/',
  'https://www.yorku.ca/',
  'https://passportyork.yorku.ca/',
  'https://my.yorku.ca/',
  'https://w2prod.sis.yorku.ca/'
];

async function isUserLoggedIn() {
  try {
    console.log('--- DEBUGGING COOKIES ---');

    // First, try to get the specific session cookie directly
    try {
      const sessionCookie = await chrome.cookies.get({
        url: 'https://www.yorku.ca/',
        name: SESSION_COOKIE_NAME
      });
      
      if (sessionCookie) {
        console.log(`✅ SUCCESS: Found ${SESSION_COOKIE_NAME} directly`);
        console.log('Cookie details:', sessionCookie);
        return true;
      }
    } catch (error) {
      console.log('Direct cookie check failed:', error);
    }

    // Fallback: Check all domains
    for (const domain of TARGET_DOMAINS) {
      console.log(`\n🔍 Checking cookies for: ${domain}`);

      try {
        const cookies = await chrome.cookies.getAll({ url: domain });

        console.log(`Found ${cookies.length} cookies for ${domain}`);
        cookies.forEach((cookie, index) => {
          console.log(`  ${index + 1}. ${cookie.name} = ${cookie.value.substring(0, 30)}...`);
          console.log(`     Domain: ${cookie.domain}, Secure: ${cookie.secure}, HttpOnly: ${cookie.httpOnly}`);
        });

        const sessionCookie = cookies.find(c => c.name === SESSION_COOKIE_NAME);

        if (sessionCookie) {
          console.log(`✅ SUCCESS: Found ${SESSION_COOKIE_NAME} at ${domain}`);
          console.log('Full cookie object:', sessionCookie);
          return true;
        }
      } catch (error) {
        console.log(`Error checking ${domain}:`, error);
      }
    }

    // Also check for the other cookie that might indicate login
    console.log('\n🔍 Checking for alternative login indicators...');
    
    try {
      const altCookie = await chrome.cookies.get({
        url: 'https://passportyork.yorku.ca/',
        name: 'pybpp'
      });
      
      if (altCookie) {
        console.log('✅ Found pybpp cookie, user might be logged in');
        console.log('Cookie details:', altCookie);
        return true;
      }
    } catch (error) {
      console.log('Alternative cookie check failed:', error);
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
    return true; // Will respond asynchronously
  }
});

// Additional helper function to debug all yorku.ca cookies
async function debugAllCookies() {
  try {
    const allCookies = await chrome.cookies.getAll({ domain: '.yorku.ca' });
    console.log('All .yorku.ca cookies:', allCookies);
    
    const passportCookies = await chrome.cookies.getAll({ domain: '.passportyork.yorku.ca' });
    console.log('All .passportyork.yorku.ca cookies:', passportCookies);
  } catch (error) {
    console.error('Debug cookies error:', error);
  }
}