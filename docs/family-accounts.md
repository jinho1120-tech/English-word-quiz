# Family accounts, child devices, and rewards

## Agreed product behavior

- A parent registers and signs in with an email address and password using Better Auth.
- The parent owns one family workspace and can create, rename, deactivate, and manage multiple child profiles.
- A child does not need an email address or a separate Better Auth user.
- Each child can use a separate phone or tablet and lands directly in child mode after the first device enrollment.
- Initial child-device enrollment supports both:
  1. A one-time QR enrollment link displayed by the signed-in parent and scanned on the child's device.
  2. A child access code plus PIN entered on the child's device.
- Successful enrollment creates a device-specific, revocable child session. Reopening the app on that device should restore child mode without asking for credentials again. Child sessions have no server-side expiry; they end only by parent revocation, child logout, or account/profile deactivation. The persistent browser cookie uses a long lifetime because browsers impose practical cookie lifetime limits.
- The parent can inspect and revoke a child's registered device sessions. A session does not expire after 90 days or any other fixed server-side period.
- Parents and the matching child can both manage that child's word database. Children cannot read or modify another child's data.
- Parents configure whether rewards are enabled, the reward criteria, the available coupon types, and the parent's SMS destination number.
- The child can earn an eligible coupon and explicitly request to notify the parent from the child's device.

## Authentication and authorization design

### Parent
- Better Auth remains the only email/password identity provider.
- A family row is created for the first authenticated parent account (the family representative).
- The representative can invite another parent by email. The invited parent signs in or registers with that exact email and accepts a seven-day, single-use invitation link.
- Additional parents are stored as family administrators and use their own Better Auth accounts and devices. They share the family workspace and child data.
- Only the representative can invite/revoke other parent administrators or remove an administrator. Administrators can manage children, words, learning settings, and coupons.
- Parent actions derive the owner user ID from the Better Auth session. They never trust a client-supplied owner ID.

### Child enrollment
- Child access codes are random, high-entropy credentials, not sequential IDs or names.
- The database stores only a hash of each access code.
- PINs are stored as salted, slow password hashes (for example, scrypt or Argon2id), never plaintext or reversible encryption.
- QR enrollment tokens are single-use, expire quickly, and are stored only as hashes.
- QR enrollment tokens are generated only by a parent authorized for the selected child.
- A QR token is a bearer credential: it must be random, short-lived, one-time, and shown only to the intended device.

### Child device sessions
- After enrollment, issue a random opaque session token in an HttpOnly, Secure (production), SameSite=Lax cookie.
- Store only the token hash in `child_device_sessions`.
- Each session belongs to exactly one child profile and one device.
- Parent revocation and child deactivation invalidate all associated child sessions.
- Child requests resolve the child identity from the server-side session cookie. They must not accept a child profile ID from the browser as proof of identity.
- Parent requests may target a child profile only after verifying that the profile belongs to the authenticated parent's family.

### Data ownership
- Every word row keeps the owning parent user ID and gains a child profile ID.
- Server queries must scope by both owner user ID and child profile ID for parent actions, or by the child profile resolved from the child session for child actions.
- Never rely on hidden UI controls or client-provided profile names for access control.
- AI rate limits remain associated with the parent account to prevent bypass through multiple child profiles.

## Coupon lifecycle

1. Parent enables or disables rewards and defines the available coupon types and reward criteria.
2. A qualifying quiz completion is evaluated on the server, not trusted from a client-provided score alone.
3. The server creates a coupon reward with a unique source key so a retried quiz submission cannot award duplicates.
4. The child chooses to notify the parent. The app opens the device's SMS composer with the configured phone number and coupon text; the child still confirms sending.
5. The server records the notification request separately from actual carrier delivery. Opening an SMS composer does not prove that a text message was sent.
6. The parent can see the earned and notification-requested history in the parent dashboard.

## Data model

- `families`: one family workspace owned by the representative parent.
- `family_members`: additional parent administrator accounts in the family.
- `family_invitations`: email-bound, expiring invitation links for co-parent administrators.
- `child_profiles`: family-owned child profile, hashed PIN and hashed access code.
- `child_device_enrollments`: expiring, one-time QR enrollment tokens.
- `child_device_sessions`: per-device child sessions, last-seen time, and revocation (no server-side expiry).
- `family_settings`: reward enablement, parent phone, and reward criteria.
- `coupon_types`: parent-managed coupon catalog.
- `coupon_rewards`: child-earned coupon snapshots and lifecycle state.
- `child_subjects`: each child's own subject catalog, with display order and archive state. Subject names are not a global fixed enum.\n- `word_entries.child_profile_id`: child ownership for learning words.\n- `word_entries.subject_id`: relation to the selected child's subject; the legacy `subject` text remains temporarily for migration compatibility.

## Implementation sequence

1. Add the family/child/reward schema without applying a database migration.
2. Implement parent family and child-profile management, including email invitations and co-parent roles.\n3. Add each child's subject catalog and migrate existing subject labels into per-child subject rows.
3. Implement code+PIN enrollment, QR enrollment, child session cookies, and parent device revocation.
4. Add server-side actor resolution and migrate all word/AI actions to enforce parent-or-owning-child authorization.
5. Replace the legacy fixed profiles and hard-coded dad phone/random coupon UI with family-configured child profiles and server-created rewards.
6. Add parent/child dashboards and end-to-end authorization tests.
7. Generate and review the final SQL migration, then apply it to the dedicated Neon database.
8. Test signup, login, two separate child devices, QR/code enrollment, data isolation, session revocation, and coupon notifications before merging.

## Explicit non-goals for the first release

- Children do not have independent email/password accounts.
- SMS is not sent automatically by the server; the child opens the native SMS composer and presses Send.
- The app does not claim a message was delivered merely because the SMS composer opened.
- The existing private `word-test` repository and its database are not modified or imported.
