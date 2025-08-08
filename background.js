// background.js

const SESSION_COOKIE_NAME = 'ppyauth';
// Corrected to a URL on the broader .yorku.ca domain.
const TARGET_DOMAIN = 'https://www.yorku.ca/';

// Function to check for the session cookie
async function isUserLoggedIn() {
  try {
    const cookie = await chrome.cookies.get({ url: TARGET_DOMAIN, name: SESSION_COOKIE_NAME });
    return !!cookie;
  } catch (error) {
    console.error('Error checking for cookies:', error);
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