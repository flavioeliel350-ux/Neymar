# Security Specification — ProntoPreço Firestore Rules

## 1. Data Invariants
1. A `UserProfile` at `/users/{userId}` can only be read, created, or updated by the matching verified user (`request.auth.uid == userId`), with `storeId == userId` immutable and self-escalation of `role` forbidden.
2. A `Store` at `/stores/{storeId}` is strictly isolated per tenant (`storeId == request.auth.uid` and `ownerId == request.auth.uid`); `ownerId`, `storeId`, and `createdAt` are immutable.
3. A `StoreOperator` at `/stores/{storeId}/operators/{operatorId}` must belong to an existing parent `Store` owned by `request.auth.uid` (`storeId == request.auth.uid`), with a strict 4-digit numeric PIN.
4. A `Product` at `/stores/{storeId}/products/{barcode}` must belong to an existing parent `Store` owned by `request.auth.uid` (`storeId == request.auth.uid`), enforce `price > 0`, bounded strings, valid categories, and server-side timestamps (`request.time`).
5. A `ScanLog` at `/stores/{storeId}/scans/{logId}` is append-only (`update` and `delete` denied), strictly isolated to `storeId == request.auth.uid`, tied to `request.auth.uid` and `request.time`.
6. Every `allow list` rule evaluates `resource.data` directly against `request.auth.uid` without `get()` or `exists()` lookups.

## 2. Dirty Dozen Adversarial Payloads
1. **Unverified Email Write**: Authenticated user with `email_verified: false` creating `/stores/uid1/products/789` -> `PERMISSION_DENIED`.
2. **Self-Role Escalation**: User creates `/users/uid1` with `role: "admin"` -> `PERMISSION_DENIED` unless user is verified owner setting store defaults safely without cross-tenant admin privilege.
3. **Profile Role Tampering**: User updates `/users/uid1` changing `role` or `storeId` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: Creating product with extra ghost field `isVerified: true` -> `PERMISSION_DENIED`.
5. **Cross-Store Product Write**: User `uid2` attempts to create/read/update product inside `/stores/uid1/products/789` -> `PERMISSION_DENIED`.
6. **Orphaned Product Creation**: Creating `/stores/nonexistent/products/789` without parent Store doc -> `PERMISSION_DENIED`.
7. **Negative/Zero Price Poisoning**: Creating product with `price: -5` or `price: 0` -> `PERMISSION_DENIED`.
8. **1MB String Exhaustion**: Creating product with 200KB `name` or `description` -> `PERMISSION_DENIED`.
9. **Client Timestamp Spoofing**: Creating product with forged `createdAt` in the past instead of `request.time` -> `PERMISSION_DENIED`.
10. **Immutable Field Overwrite**: Updating product while changing `createdAt`, `storeId`, or `ownerId` -> `PERMISSION_DENIED`.
11. **Audit Log Tampering**: Attempting `update` or `delete` on `/stores/uid1/scans/log1` -> `PERMISSION_DENIED`.
12. **PII Scraping**: User `uid2` attempting `get` or `list` on `/users/uid1` or `/stores/uid1/products` -> `PERMISSION_DENIED`.
