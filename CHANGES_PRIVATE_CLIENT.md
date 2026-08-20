# Private Client Workspace

## Added

- Dedicated interface for private client accounts (`interface: "client"`).
- Username login alias for `leticiank`.
- Client-only navigation: Dashboard, My Bots and Meu Perfil.
- Responsive desktop/mobile sidebar and dashboard.
- Dedicated client bot overview and future configuration entry point.
- Dedicated client profile with avatar selection.
- Admin-protected Firebase Function that provisions the private client account.
- Private client profiles are excluded from the Seller access-request queue.

## Preserved

- Existing Seller/Admin dashboard HTML, CSS and behavior remain available to the existing Firebase accounts.
- Existing Firebase authentication and Firestore permission model remain in place.
- Moritz × ZT Accounts visual identity is preserved.

## Security note

The private client's password is not stored in public HTML/JavaScript. See `PRIVATE_CLIENT_SETUP.md` for the Firebase Functions secret setup required before deployment.
