// content.js

// The base URL for building the loginppy redirect link.
const W2PROD_BASE_DOMAIN = 'https://w2prod.sis.yorku.ca';
const LOGINPPY_PATH = '/Apps/WebObjects/cdm.woa/wa/loginppy';

// The specific course page path that loginppy should redirect to AFTER successful token generation.
// This is the part that goes into the 'url=' parameter.
const TARGET_COURSE_PATH_FOR_LOGINPPY_RETURN = '/Apps/WebObjects/cdm.woa/12/wo/FB1Ul1UNPa47jmzOOcDcew/4.3.10.8.3.0.0.5';

// Function to send a message to the background script and get the login status
async function getLoginStatus() {
  const response = await chrome.runtime.sendMessage({ action: "checkLoginStatus" });
  return response.status;
}

// Function to tell background script to navigate the current tab
async function navigateViaBackground(url) {
    const response = await chrome.runtime.sendMessage({ action: "navigateTab", url: url });
    return response.success;
}

// Function to ask background script to fetch HTML
async function fetchHtmlFromBackground(url) {
    const response = await chrome.runtime.sendMessage({ action: "fetchHtml", url: url });
    return response;
}

// Main logic to run when the content script is injected
async function runCourseChecker() {
  const isLoggedIn = await getLoginStatus();

  if (!isLoggedIn) {
    console.log('❌ Session cookie not found. The extension will remain inactive until you log in.');
    return;
  }

  console.log('✅ Logged in! Extension is active.');

  const currentUrl = window.location.href;
  const currentUrlParams = new URLSearchParams(window.location.search);
  const tokenInCurrentUrl = currentUrlParams.get('token');

  // Check if the current page already has the token in its URL
  if (tokenInCurrentUrl) {
    // State 1: We are on a page that *already has* the token. This is the final destination.
    console.log(`➡️ Detected token in current URL. Token: ${tokenInCurrentUrl.substring(0, 20)}...`);
    console.log(`Requesting HTML fetch from background script for current URL: ${currentUrl}`);

    const fetchResult = await fetchHtmlFromBackground(currentUrl);
    
    if (fetchResult.success) {
      console.log('--- FETCHED UNLOCKED HTML CONTENT BELOW ---');
      console.log(fetchResult.html);
      console.log('--- END OF FETCHED UNLOCKED HTML CONTENT ---');
      alert('Fetched unlocked HTML! Check your browser console.');
    } else {
      console.error('💥 ERROR: Background script failed to fetch HTML:', fetchResult.error);
      alert('Error fetching unlocked content. Check console for details.');
    }

  } else {
    // State 2: We are logged in, but the current URL does NOT have a token.
    // We need to initiate the navigation that generates the token.
    console.log('🟡 Current URL has no token. Initiating navigation to generate token...');
    
    // Construct the full URL that will trigger the token generation redirect
    const urlToGenerateToken = `${W2PROD_BASE_DOMAIN}${LOGINPPY_PATH}?url=${TARGET_COURSE_PATH_FOR_LOGINPPY_RETURN}`;
    
    console.log(`Navigating current tab to: ${urlToGenerateToken}`);
    
    // Tell the background script to navigate the current tab.
    // This will cause a full page reload and the server will hopefully
    // redirect to the tokenized URL.
    const navigationSuccess = await navigateViaBackground(urlToGenerateToken); 
    
    if (navigationSuccess) {
      console.log('🔗 Navigation initiated. The content script will re-run on the next page load (hopefully with a token).');
      // IMPORTANT: This execution of the content script will largely stop here.
      // It expects to re-execute on the newly loaded page, where the 'if (tokenInCurrentUrl)' block will then be true.
    } else {
      console.error('💥 ERROR: Background script failed to initiate navigation.');
      alert('Could not navigate to generate token. See console for background error.');
    }
  }
}

// Run the main function when the content script loads on any matching page
runCourseChecker();