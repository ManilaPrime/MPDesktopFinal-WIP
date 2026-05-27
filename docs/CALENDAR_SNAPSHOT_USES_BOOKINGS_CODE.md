# Calendar Snapshot Update

The calendar add-booking dialog now uses the same save-image flow as the bookings page:

- Captures a hidden booking summary card with `html2canvas`
- Uses the same dark/gold Manila Prime card style
- Saves to `Desktop/ManilaPrime/Bookings`
- Uses Tauri `@tauri-apps/plugin-fs` to write the PNG
- Uses the same success/error toast behavior

For calendar multi-selection, the snapshot card keeps the booking-page design and adds a selected-units section when more than one unit/date range is selected.
