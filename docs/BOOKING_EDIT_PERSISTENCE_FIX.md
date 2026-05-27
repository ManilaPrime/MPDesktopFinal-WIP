# Booking Edit Persistence Fix

Issue:
- Booking edits could show a success toast but appear unchanged after reopening the booking.
- The app data store reads the Firestore `bookings` collection first when available, while the edit dialog only called the API update route.

Fix:
- Booking edits now sync through:
  1. `PUT /booking/:id`
  2. best-effort `PUT /bookings/:id` compatibility route
  3. Firestore `setDoc(..., { merge: true })` on `bookings/:id`

Affected pages:
- `src/components/pages/bookings-client.tsx`
- `src/components/pages/calendar-client.tsx`

Also retained:
- bookings page delete
- units page delete
- calendar existing-booking cancel button
