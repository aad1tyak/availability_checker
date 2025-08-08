// content.js

// Function to send a message to the background script and get the login status
async function getLoginStatus() {
  const response = await chrome.runtime.sendMessage({ action: "checkLoginStatus" });
  return response.status;
}

// Main logic
async function runCourseChecker() {
  const isLoggedIn = await getLoginStatus();

  if (isLoggedIn) {
    console.log('Session cookie found! You are logged in.');
    alert('Logged in!');
    // This is where you put your code to find the course availability link
  } else {
    console.log('Session cookie not found. The extension will remain inactive.');
  }
}

runCourseChecker();