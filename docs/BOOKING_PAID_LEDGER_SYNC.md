# Booking Paid Ledger Sync

When a booking is created or edited from the Bookings page or Calendar page:

## Booking Payment
If booking payment status is `Paid` or `Received`, the app creates/updates a booking payment ledger row.

- API sync: `PUT /booking-payment/:id`, falling back to `POST /booking-payment`
- Firestore sync:
  - `bookingPayments`
  - `booking-payments`
  - `booking_payments`

Deterministic ID:
`booking-payment-<bookingId>`

## Security Deposit
If security deposit status is `Received`, `Paid`, or `Refunded`, the app creates/updates a security deposit receive ledger row.

- API sync: `PUT /security-deposit/:id`, falling back to `POST /security-deposit`
- Firestore sync:
  - `securityDeposits`
  - `security-deposits`
  - `security_deposits`

Deterministic ID:
`security-deposit-<bookingId>`

The deterministic IDs prevent duplicate ledger rows when a booking is edited multiple times.
