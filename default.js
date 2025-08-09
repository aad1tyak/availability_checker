// default.js 

const SESSION_COOKIE_NAME = 'pyauth'; 
const PRIMARY_YORKU_URL = 'https://www.yorku.ca/'; 
const YORKU_BASE_DOMAIN = '.yorku.ca'; 

// TARGET URL - Change this to whatever course page you want to fetch
const TARGET_URL = 'https://w2prod.sis.yorku.ca/Apps/WebObjects/cdm.woa/wa/crsq?fa=SC&sj=EECS&cn=1019&cr=3.00&ay=2024&ss=FW';

let isCurrentlyLoggedIn = false;
let lastFetchTime = 0;
const FETCH_COOLDOWN = 5000; // 5 seconds cooldown between auto-fetches

// --- Automatic login detection and HTML fetching ---
async function checkLoginAndAutoFetch() {
  try {
    const isLoggedIn = await isUserLoggedIn();
    
    // If user just logged in (state changed from false to true)
    if (isLoggedIn && !isCurrentlyLoggedIn) {
      console.log('🚀 USER JUST LOGGED IN! Auto-fetching HTML content...');
      isCurrentlyLoggedIn = true;
      
      // Add small delay to ensure session is fully established
      setTimeout(() => {
        autoFetchHtml();
      }, 1000);
    }
    // If user logged out
    else if (!isLoggedIn && isCurrentlyLoggedIn) {
      console.log('👋 User logged out');
      isCurrentlyLoggedIn = false;
    }
    // If user is logged in and enough time has passed since last fetch
    else if (isLoggedIn && (Date.now() - lastFetchTime > FETCH_COOLDOWN)) {
      console.log('🔄 User still logged in, performing periodic fetch...');
      autoFetchHtml();
    }
    
  } catch (error) {
    console.error('Error in login check:', error);
  }
}

// --- Auto-fetch HTML content ---
async function autoFetchHtml() {
  try {
    lastFetchTime = Date.now();
    console.log('🎯 AUTO-FETCHING HTML FROM TARGET URL...');
    
    const result = await fetchHtmlWithCookie(TARGET_URL);
    
    if (result.success) {
      console.log('✅ AUTO-FETCH SUCCESSFUL!');
      console.log(`📄 HTML Length: ${result.length} characters`);
      console.log('📋 Full HTML content logged above');
    } else {
      console.error('❌ AUTO-FETCH FAILED:', result.error);
    }
    
  } catch (error) {
    console.error('💥 ERROR in auto-fetch:', error);
  }
}

// --- Monitor cookies for login changes ---
chrome.cookies.onChanged.addListener(async (changeInfo) => {
  // Only monitor our specific session cookie
  if (changeInfo.cookie.name === SESSION_COOKIE_NAME && 
      changeInfo.cookie.domain.includes('yorku.ca')) {
    
    if (!changeInfo.removed) {
      console.log('🍪 Session cookie detected/updated!');
      // Give it a moment then check login status
      setTimeout(checkLoginAndAutoFetch, 500);
    } else {
      console.log('🗑️ Session cookie removed');
      isCurrentlyLoggedIn = false;
    }
  }
});

// --- Monitor tab updates to detect YorkU page visits ---
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // If user visits any YorkU page and it's fully loaded
  if (changeInfo.status === 'complete' && 
      changeInfo.url && 
      changeInfo.url.includes('yorku.ca')) {
    
    console.log(`🌐 User visited YorkU page: ${changeInfo.url}`);
    
    // Check if they're logged in and auto-fetch if needed
    setTimeout(checkLoginAndAutoFetch, 1000);
  }
});

// --- Periodic check every 30 seconds ---
setInterval(checkLoginAndAutoFetch, 30000);

// --- Initial check when extension starts ---
setTimeout(checkLoginAndAutoFetch, 2000);
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