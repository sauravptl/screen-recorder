# Chrome Web Store Publishing Guide

You are seeing these errors because the Chrome Web Store requires you to justify why you need specific permissions in your `manifest.json`, and it requires specific descriptions on the Store Listing tab.

Here is exactly what you need to copy and paste into the Chrome Developer Dashboard to resolve these errors.

---

## 🔒 Privacy Practices Tab

### Single Purpose Description
> **Prompt:** What is the single purpose of your extension?
> **Copy/Paste:**
> To provide users with a simple, lightweight tool to record their screen, application windows, or browser tabs, along with system or microphone audio, and save the recordings locally.

### Permission Justifications
Scroll down to the "Permissions" section on the Privacy Practices tab and paste these exact justifications:

1. **`activeTab` Justification:**
   > **Copy/Paste:**
   > Used to capture the currently active tab's screen content if the user chooses to record the specific tab they are on.

2. **`downloads` Justification:**
   > **Copy/Paste:**
   > Used to allow the user to save and download their screen recordings (WebM files) directly to their local computer storage.

3. **`tabs` Justification:**
   > **Copy/Paste:**
   > Used to create and manage the dedicated recording tab ("recorder.html") where the screen capture, audio mixing, and countdown logic take place in the background.

4. **`Host permission (<all_urls>)` Justification:**
   > **Copy/Paste:**
   > Required to allow the extension to capture the screen and audio from any website or web application the user chooses to record.

### Remote Code Usage
> **Prompt:** Does your item use remote code?
> **Action:** You should select **"No, I am not using remote code."**
> *(Note: The extension uses a Google Font via CSS, which is remote styling, but it does NOT execute remote JavaScript/code, which is prohibited in Manifest V3 anyway. Selecting No should clear the remote code error).*

### Data Handling / Certifications
At the very bottom of the Privacy practices tab, there will be checkboxes asking you to certify compliance.
> **Action:** Check all the boxes that certify your data usage complies with the developer programme policies. (The extension processes everything locally and does not collect, transmit, or sell user data).

---

## 📝 Store Listing Tab

### Detailed Description
The store listing requires a detailed description of at least 25 characters. 
> **Action:** Paste the following into the **Detailed Description** box on the Store Listing tab:

> **Copy/Paste:**
> ScreenRec is a premium, lightweight, and privacy-focused screen recording extension for Chrome. It allows you to quickly capture your screen, application windows, or specific browser tabs with just a few clicks.
> 
> Features:
> - Record your entire desktop or specific tabs.
> - Capture microphone audio, system audio, or both simultaneously.
> - Beautiful dark-themed dashboard to manage all your recordings.
> - 100% Local: No watermarks, no sign-ups, and your recordings never leave your computer.
> 
> Whether you need to record a quick tutorial, capture a video meeting, or save a presentation, ScreenRec provides a seamless, high-quality recording experience.
