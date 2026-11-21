# Security Specification — ProntoPreço Firestore Rules

## 1. Data Invariants
1. A `UserProfile` at `/users/{userId}` can only be read or created by the matching verified user (`request.auth.uid == userId`) or a bootstrapped admin, and non-admins cannot elevate `role` or reassign `storeId`.
2. A `Store` at `/stores/{storeId}` must bind `storeId == storeId` and `ownerId == request.auth.uid` on creation; `ownerId` and `createdAt` are immutable.
3. A `StoreOperator` at `/stores/{storeId}/operators/{operatorId}` must belong to an existing parent `Store` owned by `request.auth.uid` (Master Gate), with a strict 4-digit numeric PIN.
4. A `Product` at `/stores/{storeId}/products/{barcode}` must belong to an existing parent `Store` owned by `request.auth.uid`, enforce `price > 0`, bounded strings, valid categories, and server-side timestamps (`request.time`).
5. A `ScanLog` at `/stores/{storeId}/scanLogs/{logId}` is append-only (`update` and `delete` denied), tied to `request.auth.uid` and `request.time`.
6. Every `allow list` rule evaluates `resource.data` directly without `get()` or `exists()` lookups.

## 2. Dirty Dozen Adversarial Payloads
1. **Unverified Email Write**: Authenticated user with `email_verified: false` creating `/stores/uid1/products/789` -> `PERMISSION_DENIED`.
2. **Self-Role Escalation**: User creates `/users/uid1` with `role: "admin"` when not admin -> `PERMISSION_DENIED`.
3. **Profile Role Tampering**: User updates `/users/uid1` changing `role` from `"operator"` to `"admin"` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection**: Creating product with extra ghost field `isVerified: true` -> `PERMISSION_DENIED`.
5. **Cross-Store Product Write**: User `uid2` attempts to create/update product inside `/stores/uid1/products/789` -> `PERMISSION_DENIED`.
6. **Orphaned Product Creation**: Creating `/stores/nonexistent/products/789` without parent Store doc -> `PERMISSION_DENIED`.
7. **Negative/Zero Price Poisoning**: Creating product with `price: -5` or `price: 0` -> `PERMISSION_DENIED`.
8. **1MB String Exhaustion**: Creating product with 200KB `name` or `description` -> `PERMISSION_DENIED`.
9. **Client Timestamp Spoofing**: Creating product with forged `createdAt` in the past instead of `request.time` -> `PERMISSION_DENIED`.
10. **Immutable Field Overwrite**: Updating product while changing `createdAt` or `ownerId` -> `PERMISSION_DENIED`.
11. **Audit Log Tampering**: Attempting `update` or `delete` on `/stores/uid1/scanLogs/log1` -> `PERMISSION_DENIED`.
12. **PII Scraping**: User `uid2` attempting `get` or `list` on `/users/uid1` -> `PERMISSION_DENIED`.
