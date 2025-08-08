// background.js

const SESSION_COOKIE_NAME = 'ppyauth';
const TARGET_DOMAIN_WILDCARD = 'https://*.yorku.ca/';

// Function to check for the session cookie
async function isUserLoggedIn() {
  try {
    console.log('--- DEBUGGING COOKIES ---');
    console.log(`Attempting to get all cookies for domain: ${TARGET_DOMAIN_WILDCARD}`);
    
    // Get ALL cookies for the broader YorkU domain
    const allCookies = await chrome.cookies.getAll({ url: TARGET_DOMAIN_WILDCARD });

    console.log('Found these cookies:', allCookies);
    
    // Now, find our specific session cookie in the list
    const sessionCookie = allCookies.find(cookie => cookie.name === SESSION_COOKIE_NAME);

    if (sessionCookie) {
      console.log('SUCCESS! Found the session cookie:', sessionCookie);
      return true;
    } else {
      console.log('FAILURE. The session cookie was not found in the list.');
      return false;
    }
  } catch (error) {
    console.error('Error in cookie check:', error);
    return false;
  }
}

// Listen for a message from the content script
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.action === "checkLoginStatus") {
      isUserLoggedIn().then(isLoggedIn => {
        sendResponse({ status: isLoggedIn });
      });
      return true;
    }
  }
);