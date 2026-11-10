# Chrome Web Store and Edge Add-ons listing (English)

## Name

Tirai: privacy curtain for WhatsApp Web

## Short description (132 characters or fewer)

Blurs the WhatsApp Web chats you are not reading, masks ID and bank numbers, and covers everything while you share your screen.

## Long description

Tirai keeps your WhatsApp Web chats private when other people can see your screen.

In Normal mode, the chat list is covered with a frosted curtain and the chat you have open stays readable. A small reading lamp follows your cursor, so you can read one chat or one message by pointing at it. Full mode covers the whole page. One shortcut (Alt+Shift+Z) switches between the two.

What you can do with it:
- Cover the chat list, or the whole page, and read one row or message at a time with the lamp.
- Choose, for the chat you have open, whether it follows the mode, is always hidden, or is always shown.
- Hide sensitive numbers in the chat you are reading: ID numbers (NIK), bank account numbers, card numbers, one-time codes, and phone numbers. E-mail addresses can be switched on. Hover a number for a moment to read it. Copying still gives the real text.
- Cover everything automatically while a browser meeting shares your screen (Google Meet, Zoom, Teams, Discord, Slack, Whereby, Jitsi). This is optional and Tirai asks for the permission only when you turn it on.
- Cover the page when the WhatsApp window is not active, or when you have left the computer. Both are optional.
- Put the same curtain on any other tab, such as a banking page, with "Cover this tab".
- Use the popup and settings in Indonesian or English.

How it works: Tirai draws a frosted layer above the page instead of restyling WhatsApp's own elements, which change often. If WhatsApp changes its layout, Tirai covers the whole page and tells you in the Tirai menu.

Privacy: Tirai does not collect or transmit any data. It makes no network requests. Your settings stay in your browser.

Limits: Tirai is a visual privacy screen. It does not protect you from someone who is using your computer, so use WhatsApp's own App Lock for that. It does not cover the WhatsApp Desktop app. The number detector can miss some cases, and its measured results are published in the project's repository.

Tirai is not affiliated with WhatsApp or Meta.

Source code (MIT licence): https://github.com/Daendells/tirai

## Single purpose

Tirai has one purpose: to keep WhatsApp Web chats and other sensitive page content hidden from people who can see the screen. Everything it does (the curtain, the reading lamp, number masks, and automatic covering during screen sharing, inactivity or leaving the computer) serves that purpose.

## Permission justifications

- **Host access to https://web.whatsapp.com/*** : Tirai draws the curtain and the number masks on WhatsApp Web. It needs to read the page layout and the visible text there to know what to cover. Nothing is sent anywhere.
- **storage**: Keeps the user's settings and chat rules in the browser, and a short-lived state (such as "computer is idle") while the browser is open.
- **idle**: Lets Tirai cover the page when the user has left the computer, if the user turned that option on.
- **scripting**: Adds Tirai to WhatsApp tabs that were already open when it was installed or updated, registers the screen-share scripts after the user turns that option on, and puts the curtain on another tab when the user asks.
- **activeTab**: Lets the user cover the current non-WhatsApp tab with "Cover this tab" or the shortcut, without giving Tirai access to all websites.
- **Optional host access to meeting sites** (meet.google.com, *.zoom.us, teams.microsoft.com, teams.live.com, discord.com, app.slack.com, *.whereby.com, meet.jit.si): Requested only when the user turns on "Cover everything while I share my screen". Tirai uses it to run a small script that notices when the page starts or stops a screen share, so it can cover WhatsApp during the share. It does not read or record the meeting. Turning the option off removes the permission.

## Data-use disclosure

Tirai does not collect or transmit any data.

- Personally identifiable information: not collected.
- Health, financial, authentication, location, web history, user activity, website content: not collected or transmitted. Tirai reads the visible text on WhatsApp Web inside the browser only to place masks. The text is not stored or sent.
- Settings and chat-rule names are stored locally in the browser.
- The data is not sold, not used for anything outside Tirai's single purpose, and not used for creditworthiness or lending.

Privacy policy: https://github.com/Daendells/tirai/blob/main/docs/privacy.md

## Notice

Tirai is not affiliated with WhatsApp or Meta. WhatsApp is a trademark of its owner.
