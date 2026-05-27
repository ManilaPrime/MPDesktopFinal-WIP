# Authorization Letter Fields

The authorization letter copy button now uses the app data fields instead of placeholder text.

## Field mapping

- `checkindate` is filled from `booking.checkinDate` or the selected calendar range check-in date.
- `checkoutdate` is filled from `booking.checkoutDate` or the selected calendar range checkout date.
- `unitname` is filled from the selected unit's `unit.name`.
- `guestname` is filled from `booking.guestName` when available, otherwise from `guestFirstName + guestLastName`.

For calendar multiple selection, one authorization letter is generated per selected unit/date range.
