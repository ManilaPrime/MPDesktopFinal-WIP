# Delete Bookings and Units

Added delete actions:

## Bookings page
- Row menu now includes **Delete**.
- Existing booking edit dialog now includes **Delete**.
- Uses `DELETE /booking/:id`.
- Shows a confirmation before deleting.
- Refreshes bookings after deletion.

## Units page
- Unit card menu now includes **Delete Unit**.
- Existing unit edit dialog now includes **Delete Unit**.
- Uses `DELETE /unit/:id`.
- Shows a confirmation before deleting.
- Warns if bookings reference the unit.
- Refreshes units after deletion.
