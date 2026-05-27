# Booking status field fix

The booking edit form now keeps payment/deposit status values in all status field shapes used by the app/API:

- `paymentStatus`
- `bookingPaymentStatus`
- `bookingPayment.status`
- `bookingPayment.paymentStatus`
- `securityDepositStatus`
- `securityDeposit.status`
- `securityDepositReceipt.status`

This prevents status changes from reverting after save/refresh when the backend or Firestore data source reads a different field name than the form originally updated.
