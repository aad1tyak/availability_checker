# YorkU Course Availability Checker

Tired of manually refreshing YorkU's course pages? This browser extension automates the job for you! It's designed to monitor seat availability in specific course sections and let you know the moment a spot opens up.

---

### How It Works: The Sneaky Secret 🤫

The YorkU portal uses a special, temporary **token** to verify you're logged in. Without it, you can't see course details. Our extension's clever trick is that it **captures this token** in the background during your normal login process. It then uses this captured token to perform its own automated checks on the course page, bypassing the need for you to be actively on that page. It's like having a personal assistant constantly checking for a seat for you.

---

### Key Features

-   **Set and Forget:** Add your desired course URL and section letter once.
-   **Real-Time Status:** The extension popup shows you if a course is "Available," "Restricted," or "Full."
-   **Local Storage:** Your courses are saved directly in your browser's local storage, so they're always there when you need them.

---

### Getting Started

1.  **Install:** In Chrome, enable **Developer mode** on `chrome://extensions` and "Load unpacked" the extension folder.
2.  **Log In:** The most important step! Log out of YorkU and log back in completely. This allows the extension to capture your session token.
3.  **Track:** Click the extension's icon, add your course URL and section letter, and let the extension do the rest!