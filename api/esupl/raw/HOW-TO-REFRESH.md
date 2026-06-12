# Refreshing the Esupl API docs

These files are mirrored from the public Postman collection so we don't hit the web
during normal work.

Source: https://documenter.getpostman.com/view/158253/2sA3JFB4y8

## Re-sync steps

1. Open the Postman doc in Chrome with remote debugging:
   ```powershell
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" `
     --remote-debugging-port=9222 --user-data-dir="$env:TEMP\chrome-debug-mvp" `
     "https://documenter.getpostman.com/view/158253/2sA3JFB4y8"
   ```
2. Pull fresh raw JSON (fetched through the page context, so it passes the proxy):
   ```powershell
   node D:\_work\mvp\.tools\fetch-docs.mjs
   ```
   Writes `raw/collection.json` (+ `metadata.json`).
3. Regenerate the Markdown:
   ```powershell
   node D:\_work\mvp\.tools\gen-docs.mjs
   ```

`raw/collection.json` is a standard Postman Collection v2 and can be re-imported
into Postman directly.
