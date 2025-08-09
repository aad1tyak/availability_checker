// default.js 

const SESSION_COOKIE_NAME = 'pyauth'; 
const PRIMARY_YORKU_URL = 'https://www.yorku.ca/'; 
const YORKU_BASE_DOMAIN = '.yorku.ca'; 

// TARGET URL - Change this to whatever course page you want to fetch
const TARGET_URL = 'https://apps4.sis.yorku.ca/Apps/WebObjects/OSS.woa/3/wo/ap9CiAtw0IbPty695qEn30/0.3';

// --- Cookie-based Login Check ---
async function isUserLoggedIn() {
  try {
    console.log('--- CHECKING LOGIN STATUS ---');
    console.log(`Looking for session cookie '${SESSION_COOKIE_NAME}' from URL: ${PRIMARY_YORKU_URL}`);
    
    // Try to get the specific session cookie
    const specificCookie = await chrome.cookies.get({
      url: PRIMARY_YORKU_URL,
      name: SESSION_COOKIE_NAME
    });

    if (specificCookie) {
      console.log(`✅ Found session cookie '${SESSION_COOKIE_NAME}'`);
      console.log('Cookie details:', specificCookie);
      return true;
    } else {
      console.log(`❌ Session cookie '${SESSION_COOKIE_NAME}' not found`);
      return false;
    }
  } catch (error) {
    console.error('💥 ERROR in login check:', error);
    return false;
  }
}

// --- Fetch HTML using session cookie ---
async function fetchHtmlWithCookie(targetUrl) {
  try {
    console.log(`--- FETCHING HTML FROM: ${targetUrl} ---`);
    
    // Check if user is logged in first
    const isLoggedIn = await isUserLoggedIn();
    if (!isLoggedIn) {
      throw new Error('Not logged in to YorkU. Please log in through the YorkU portal first.');
    }

    // Fetch the target URL - the browser will automatically include cookies for the domain
    console.log('Fetching HTML with session cookie...');
    const response = await fetch(targetUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    console.log(`✅ Successfully fetched HTML, length: ${html.length} characters`);
    
    // Log the entire HTML content
    console.log('='.repeat(80));
    console.log('COMPLETE HTML CONTENT:');
    console.log('='.repeat(80));
    console.log(html);
    console.log('='.repeat(80));
    
    return {
      success: true,
      html: html,
      length: html.length
    };
    
  } catch (error) {
    console.error('💥 ERROR fetching HTML:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// --- Message listener ---
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    
    if (request.action === "checkLoginStatus") {
      isUserLoggedIn().then(isLoggedIn => {
        sendResponse({ status: isLoggedIn });
      });
      return true; 
    } 
    
    else if (request.action === "fetchTargetHtml") {
      // Fetch HTML from the target URL using session cookie
      fetchHtmlWithCookie(TARGET_URL).then(result => {
        sendResponse(result);
      });
      return true;
    }
    
    else if (request.action === "fetchCustomHtml") {
      // Fetch HTML from a custom URL provided in the request
      const customUrl = request.url || TARGET_URL;
      fetchHtmlWithCookie(customUrl).then(result => {
        sendResponse(result);
      });
      return true;
    }
  }
);