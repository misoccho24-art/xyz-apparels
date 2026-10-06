# Setup: Google Sheet as the database (free, about 15 minutes)

Everything is stored in a Google Sheet + a private Google Drive folder that belong to
**whoever creates them**. For the handover, do these steps while signed in to the CLIENT'S
Google account (or create it under yours and transfer ownership - see "Handover").

The Sheet stays private and is never shown on the website. The website talks only to a small
script (`apps-script/Code.gs`) that asks for a password before it reads or writes anything.

- **Viewer password** - for staff / the client's customers: can only VIEW.
- **Admin password** - can view AND edit in the Admin Panel.

## 1. Create the Sheet and paste the script
1. Go to https://sheets.google.com -> **Blank spreadsheet**. Name it e.g. `XYZ Orders Data`.
2. Menu **Extensions -> Apps Script**.
3. Delete the sample code, open `apps-script/Code.gs` from this folder, copy ALL of it, paste it in, press **Save**.

## 2. Set the two passwords
1. In the Apps Script page, left side: **Project Settings** (gear icon).
2. Scroll to **Script properties -> Add script property**. Add two:
   - `ADMIN_PASSWORD` = your strong admin password
   - `VIEWER_PASSWORD` = a different password for viewers
3. Save. (Use long passwords. After 10 wrong tries the script locks for 15 minutes.)

## 3. Publish the script as a web app
1. Top right: **Deploy -> New deployment** -> gear icon -> **Web app**.
2. **Execute as: Me** and **Who has access: Anyone**. (This is normal - the passwords protect it.)
3. **Deploy**, then **Authorize access** (Google will warn it is unverified: *Advanced -> Go to project*).
   It asks for Sheets + Drive access so it can save the images in a private folder.
4. Copy the **Web app URL** (ends with `/exec`).

## 4. Connect the website
Open `sheets-config.js` and replace `PASTE_WEB_APP_URL` with that URL.

## 5. Put the website online
The website is plain files, so any free static host works:
- **Netlify Drop** (https://app.netlify.com/drop): drag the whole `InvManagement` folder in, get a link.
- or Cloudflare Pages / GitHub Pages / Firebase Hosting.

Send the link + the viewer password to people who need to look. Admin Panel: `your-link/admin-panel`.

## What you will see in the Sheet
- **Designs** tab: one row per design (order, design number, image id, quantity, cutting, print, sewing, finishing, name).
- **Orders** tab: the date for each order.
- **Drive -> "XYZ Orders Images"**: the uploaded pictures (private, not shared).
Clients may READ these tabs. If they edit them by hand, keep the columns and the "Order"/"Design" numbers
intact, and do not touch the "Image ID" column.

## Handover checklist
- Easiest: do the whole setup in the client's own Google account, so they own the Sheet, script and images.
- If you built it in your account: open the Sheet -> **Share** -> add the client as **Editor**, then
  **Share -> three dots -> Transfer ownership**. Also move the "XYZ Orders Images" Drive folder to them.
  The script runs "as the owner", so after transfer the CLIENT must open Apps Script and **Deploy -> New deployment**
  again, then paste the new URL into `sheets-config.js`.
- Client should change both passwords (Script properties) and turn on 2-Step Verification.
- NEVER share the Sheet with "Anyone with the link" - keep it private.
- Optional backup: **File -> Make a copy** now and then.

## Limits
- Apps Script is slower than a real database (a page may take a few seconds to load images).
- Free Google accounts allow plenty for this use (thousands of requests a day).
- If you change the number of orders (6), update `ORDERS` in `app.js` and `ORDER_COUNT` in `Code.gs`.

## Recovering from mistakes (built in)
- **Recycle bin** (Admin Panel > "Recycle bin"): every deleted design (and every design inside a removed order)
  is kept for 30 days. Press **Restore** to bring it back (it returns at the end of its order, picture included),
  or **Delete forever**. The Sheet's **Trash** tab holds the same list.
- **Version history** (Admin Panel > "Version history"): before every save, a snapshot of all names, quantities,
  dates and picture links is stored (last 15). Press **Restore this version** to go back. Your current data is stored
  first, so a restore can be undone too. The Sheet's **History** tab holds these (do not edit it).
- **Pictures** are only removed from Drive when nothing uses them any more: not the live data, not the recycle bin,
  not a stored version.
- Extra safety from Google itself: Sheet > File > Version history, and Drive keeps trashed files for 30 days.
- After changing `Code.gs`: Deploy > Manage deployments > pencil > **New version** > Deploy (the address stays the same).
