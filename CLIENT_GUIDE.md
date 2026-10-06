# Sakib Apparels - Order Tracker: Guide for the owner

## Two passwords
- **Viewer password** - anyone you give it to can look at orders and designs (read only).
- **Admin password** - lets you change things in the **Admin Panel** (`your-link/admin-panel`).
  The admin password also opens the normal pages.

The site logs you out by itself after **30 minutes** of no activity (never while you have unsaved changes).

## How to change a password
1. Open your Google Sheet **"XYZ Orders Data"** (signed in with the Google account that owns it).
2. Menu **Extensions > Apps Script**.
3. Left side: **Project Settings** (gear icon). Scroll to **Script properties**.
4. Click **Edit script properties**. Change the value of `ADMIN_PASSWORD` and/or `VIEWER_PASSWORD`.
5. Click **Save script properties**. The new password works immediately; the old one stops working.
   Everyone has to log in again with the new password.
Use long passwords (12+ characters). Write them down somewhere safe: Google does not show them again.

## Everyday use (Admin Panel)
- **Order buttons** at the top choose the order. **+ Add order** adds one; **- Remove last order** removes the last one.
- **Order details**: date, name/buyer/PO number, number of products and a note for the selected order.
  The product count is shown, larger, beside the order name on the home page and the order page.
- **+ Add design** adds one design. **Add designs from pictures** (or just **drag pictures onto the table**)
  makes one design per picture, named after the file. Edit the names afterwards.
- **Products**: how many products are in the design. It is shown, larger, right beside the design's name.
- Click a picture to see it large, replace it, or edit that design's numbers.
- Always press **Save**. Nothing is stored until you do. The status next to the button shows "Saved".

## If something is deleted or wrong
- **Recycle bin**: every deleted design is kept for 30 days. Press **Restore** to bring it back.
- **Version history**: a copy of everything is stored before every save (last 15). Press **Restore this version**
  to go back. Your current data is stored first, so even a restore can be undone.
- **Download backup**: saves everything (including pictures) to a file on your computer. Do this now and then
  (for example monthly) and keep the file safe. **Restore from backup** loads it again.
- **Export to Excel (CSV)**: a spreadsheet of all orders and designs, opens in Excel.

## For your team (viewers)
- Search box on the Orders page (your-link/admin): type a design name, or an order name/number.
- On an order page: filter the designs, see totals,
  and press **Print / PDF** for a clean printout.

## Please do not
- Share the Google Sheet with "Anyone with the link". Keep it private.
- Edit or delete the **Trash** and **History** tabs in the Sheet, or the "Image ID" column.
- Delete the Drive folder **"XYZ Orders Images"** (it holds the pictures).

## Good to know
- Your Google account's free storage (15 GB) is shared with Gmail and Photos. Pictures are small (about 100 KB each).
- Turn on **2-Step Verification** for the Google account that owns the data.
