# Handover checklist

Tick each box as you go. Client Google account: **sohagmktdu17@gmail.com**

## A. Test on your computer
- [ ] Stop the old local server (Ctrl+C in the terminal), then start it again:
      `cd "C:\Users\HP\.vscode\Iftar\InvManagement"` then `npx.cmd serve -l 5500`
- [ ] Open `http://localhost:5500` (use localhost, not the numbered address).
- [ ] Viewer password opens the homepage. A wrong password is rejected.
- [ ] Admin Panel (`/admin-panel`): admin password works; the viewer password is rejected there.
- [ ] Add a design to Order 1, give it a product name, upload a picture, type a quantity, press Save. It says "Saved". The name shows on the order page.
- [ ] Press **+ Add order**, add a design, Save. Reload: the new order is still there.
- [ ] Click an image: the large view and details open. Try Replace image, and Delete (it asks to confirm).
- [ ] Set a date on one order, Save. It shows on that order's box only; the other boxes say "No date added".
- [ ] In the client's Sheet: the Designs and Orders tabs show your data. In Drive: the "XYZ Orders Images" folder has the picture.

## B. Clean up before handing over
- [ ] Delete every test design in the Admin Panel and press Save.
- [ ] Orders you added for testing (7, 8...) stay in the Sheet. Tell me if you want a "remove order" button.
- [ ] In the Sheet, check the Designs tab is empty (only the header row).
- [ ] Stop the local server (Ctrl+C).

## C. Put the site online (client's account)
- [ ] Create a free Netlify account with the client's email (or the client does it).
- [ ] Go to https://app.netlify.com/drop and drag the whole `InvManagement` folder in.
- [ ] Copy the link it gives you.
- [ ] Open the link: viewer login works, admin login works at `your-link/admin-panel`, data loads.
- [ ] (Optional) Rename the site in Netlify to something readable.

## D. Security
- [ ] The two passwords are strong and different (Apps Script > Project Settings > Script properties).
- [ ] Never share the Sheet publicly ("Anyone with the link"). Keep it private.
- [ ] Client turns on 2-Step Verification on their Google account.
- [ ] Keep the passwords written down safely; they cannot be read back from Google.

## E. Handover to the client
- [ ] Give the client: the website link, the admin link, the viewer password, the admin password.
- [ ] Give the client: the Google account (sohagmktdu17@gmail.com), the Netlify account, and the `InvManagement` folder (backup copy).
- [ ] Tell them: the Google account is 88% full, so they may need to free up space or buy storage.
- [ ] Tell them: do not edit the Order, Design or Image ID columns in the Sheet by hand.
- [ ] Tell them: File > Make a copy of the Sheet now and then, as a backup.
- [ ] Sign out of the client's Google account on your browser.
- [ ] Remove your own Google accounts from any sharing lists (nothing should be shared with you).

## F. If something goes wrong
- Wrong password message but the password is right: wait 15 minutes (the script locks after 10 wrong tries).
- Page shows "Could not connect": check the web app URL in `sheets-config.js`.
- After changing `Code.gs`, redeploy: Apps Script > Deploy > Manage deployments > pencil > New version > Deploy.

## G. Recovery features (test once)
- [ ] Delete a design that has data. Open **Recycle bin** in the Admin Panel: it is listed with its picture. Press Restore: it is back.
- [ ] Open **Version history**: each save is listed. Restore an older version, then restore the newest one again to undo it.
- [ ] Tell the client: deleted designs stay in the recycle bin for 30 days; the last 15 saves can be restored.
- [ ] Tell the client NOT to edit or delete the **Trash** and **History** tabs in the Sheet.

## H. New features - test once on the real Sheet (then clean up)
- [ ] Admin Panel > Order 1: fill in **Date**, **Order name** and **Note**. Save. The home page box shows the name and date; the order page shows the name, note and "Last updated".
- [ ] **Add designs from pictures**: choose 3 pictures at once (or drag them onto the table). Three designs appear, named after the files. Save.
- [ ] Type Quantity and Finishing numbers. Save. The order page shows totals and a progress bar; the home page box shows "xx% finished".
- [ ] Home page: type a design name in the **search box**: it is found. Click a result: the order page opens with that design highlighted.
- [ ] Order page: **Filter** works. **Print / PDF** (Ctrl+P preview) looks clean.
- [ ] **Download backup**: a .json file downloads. **Export to Excel (CSV)** opens in Excel.
- [ ] Open the site again as a viewer: the page appears immediately, with "Updating..." for a moment.
- [ ] On a phone: tables show as cards.
- [ ] Sheet tab **Orders** now has 6 columns (Order, Date, Designs, Name, Note, Updated). That is expected.
- [ ] Give the client **CLIENT_GUIDE.md** (how to use, change passwords, backups, recovery).
- [ ] Browser note: the site keeps a copy of the last-seen data in the browser for speed. **Log out** (or 30 minutes idle) erases it, which matters on shared computers.
