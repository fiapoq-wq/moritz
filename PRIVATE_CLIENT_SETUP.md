# Private client login

The project now has a dedicated client workspace for the Firebase profile marked with `interface: "client"`.

## Leticia account

- Username shown on the login screen: `leticiank`
- Internal Firebase Auth email: `leticiank@moritz.services`
- Interface: private client workspace
- Role: `client`

The password is intentionally **not stored in the website source**. Configure it as a Firebase Functions secret before deploying:

```bash
firebase functions:secrets:set LETICIANK_PASSWORD
```

When prompted, enter the password chosen for this account. Then deploy Functions and Firestore rules:

```bash
firebase deploy --only functions,firestore:rules
```

After deployment, sign in once with an approved administrator account. The admin dashboard automatically calls the protected `provisionPrivateClients` function and creates/repairs the `leticiank` Firebase Auth user and its Firestore profile.

The client can then sign in at the normal login screen with username `leticiank`; the frontend maps that alias to the internal Firebase email without exposing the password.
