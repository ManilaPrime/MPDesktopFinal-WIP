# Calendar authorization copy and snapshot update

Added:
- Calendar add-booking dialog now includes Save Image and Copy Letter buttons.
- Bookings add/edit dialog now includes Copy Letter.
- Authorization letters are generated per unit/date range.
- Multi-unit calendar selections copy separate letters divided by a separator.

Authorization letter format:

Dear Admin,

I'm Rey Arjay Rojo Patiag, SPA of the said unit, please allow my GUEST
to enter and stay in the said unit checkindate to checkoutdate

UNIT: unitname

Guest
guestname


Thank you very much!


## Snapshot filename parity fix

Calendar snapshots now keep the same base filename pattern used by `bookings-client.tsx`:

`YYYYMMDD_<UnitName>_<identifier>.png`

For calendar-created draft bookings, the identifier uses the same guest fallback pattern as bookings page snapshots:

`<guestFirstName>-<guestLastName>`, falling back to `booking`.

For a multi-selection snapshot, the same base pattern is preserved and `_N-bookings` is appended only to avoid overwriting one combined snapshot file.
