# Database Schemas

All models. UUID primary keys. All timestamps UTC. `created_at` auto-add,
`updated_at` auto-now unless noted. FKs use `on_delete` noted per field where it
matters; default `PROTECT` for financial/audit rows, `CASCADE` for child rows.

Choice values are the **exact strings** to store. Do not invent new ones.

---

## User
- `id` UUID PK
- `phone` string unique (E.164, e.g. `+996700123456`)
- `name` string nullable
- `email` string nullable
- `role` choice: `customer` | `business_owner` | `staff` | `admin`
- `is_active` bool default true
- `is_phone_verified` bool default false
- `created_at`, `updated_at`
- Notes: custom user model (`AUTH_USER_MODEL`). Phone is the username field. No
  password for customers/staff (OTP/PIN); business_owner + admin may set password.

## CustomerProfile
- `id` UUID PK
- `user` FK(User) one-to-one
- `birthday` date nullable
- `language` string default `ru` (`ru` | `en` | `ky`)
- `marketing_opt_in` bool default false
- `created_at`, `updated_at`

## Business
- `id` UUID PK
- `owner` FK(User, role=business_owner)
- `name` string
- `category` choice (cafe, restaurant, barber, beauty, retail, bakery, other)
- `description` text nullable
- `address` string
- `area` string  (Bishkek district/area)
- `latitude` decimal(9,6) nullable
- `longitude` decimal(9,6) nullable
- `phone` string
- `instagram_url` string nullable
- `logo` image nullable
- `cover_image` image nullable
- `working_hours` json  (e.g. `{"mon":["09:00","21:00"], ...}`)
- `status` choice: `pending` | `approved` | `rejected` | `disabled`  (default `pending`)
- `created_at`, `updated_at`
- Rule: only `approved` businesses may create rewards/offers or have active QR.

## StaffMember
- `id` UUID PK
- `business` FK(Business)
- `user` FK(User) nullable  (null = shared-PIN staff)
- `name` string
- `pin_hash` string nullable  (hashed, never store raw PIN)
- `role` choice: `cashier` | `manager`
- `is_active` bool default true
- `created_at`, `updated_at`
- Rule: staff belongs to exactly one business. `manager` sees limited analytics.

## QRCodeToken
- `id` UUID PK
- `token` string unique, indexed, random ≥22 chars (urlsafe, unguessable)
- `type` choice: `merchant_collect` | `customer_profile` | `reward_redeem`
  | `group_invite` | `group_checkin` | `group_reward` | `campaign`
- `business` FK(Business) nullable
- `customer` FK(User) nullable
- `reward_progress` FK(CustomerRewardProgress) nullable
- `reward_redemption` FK(RewardRedemption) nullable
- `group_deal` FK(GroupDeal) nullable
- `campaign` FK(Campaign) nullable
- `expires_at` datetime nullable
- `is_active` bool default true
- `created_at`
- Rules: token random not raw IDs · backend validates every action · expirable ·
  admin-disablable · every scan logged in ScanLog.

## ApprovalCode
- `id` UUID PK
- `business` FK(Business)
- `code` string  (short, e.g. 4–6 digits/alnum)
- `valid_from` datetime
- `valid_to` datetime
- `is_active` bool default true
- `created_at`
- Rule: business-specific, rotates daily (Celery beat). Validation checks
  business + time window + is_active.

## RewardProgram
- `id` UUID PK
- `business` FK(Business)
- `type` choice: `stamp` | `visit` | `spend` | `coupon` | `welcome` | `birthday`
- `title` string
- `description` text
- `required_count` int nullable  (stamps/visits target)
- `required_spend` decimal nullable
- `reward_description` text
- `minimum_spend` decimal nullable
- `expiry_days` int nullable  (unlocked reward lifetime)
- `max_redemptions_per_customer` int nullable
- `terms` text nullable
- `is_active` bool default true
- `created_at`, `updated_at`
- MVP priority types: stamp, visit, coupon.

## CustomerRewardProgress
- `id` UUID PK
- `customer` FK(User)
- `business` FK(Business)
- `reward_program` FK(RewardProgram)
- `current_count` int default 0
- `current_spend` decimal default 0
- `target_count` int nullable  (snapshot of program.required_count at creation)
- `status` choice: `active` | `unlocked` | `redeemed` | `expired`
- `unlocked_at` datetime nullable
- `expires_at` datetime nullable
- `created_at`, `updated_at`
- Constraint: unique (customer, business, reward_program) while active.

## RewardTransaction
- `id` UUID PK
- `customer` FK(User)
- `business` FK(Business)
- `reward_program` FK(RewardProgram)
- `progress` FK(CustomerRewardProgress)
- `action` choice: `earned` | `adjusted` | `reversed` | `unlocked`
- `amount_count` int default 1
- `amount_spend` decimal nullable
- `source` choice: `qr_scan` | `staff_manual` | `admin_adjustment` | `group_deal`
- `staff` FK(StaffMember) nullable
- `metadata` json nullable
- `created_at`
- Append-only ledger. Never mutate; corrections add a new row.

## RewardRedemption
- `id` UUID PK
- `customer` FK(User)
- `business` FK(Business)
- `reward_program` FK(RewardProgram)
- `progress` FK(CustomerRewardProgress)
- `code` string unique  (short manual code + backing QR token)
- `status` choice: `pending` | `redeemed` | `expired` | `cancelled`
- `redeemed_by` FK(StaffMember) nullable
- `redeemed_at` datetime nullable
- `expires_at` datetime nullable
- `created_at`

## GroupOffer
- `id` UUID PK
- `business` FK(Business)
- `title` string
- `description` text
- `category` string
- `min_group_size` int
- `max_group_size` int nullable
- `min_paid_customers` int nullable
- `min_spend_per_person` decimal nullable
- `reward_type` choice: `free_shared_item` | `group_discount` | `leader_reward`
  | `buy_x_get_y` | `friend_booking` | `custom`
- `reward_description` text
- `valid_from` date
- `valid_to` date
- `valid_days` json  (e.g. `["mon","tue","fri"]`)
- `time_start` time
- `time_end` time
- `max_groups_per_day` int nullable
- `checkin_window_minutes` int default 30
- `requires_staff_code` bool default true
- `requires_staff_approval` bool default true
- `terms` text nullable
- `status` choice: `draft` | `pending_approval` | `active` | `paused`
  | `expired` | `rejected`
- `created_at`, `updated_at`

## GroupDeal
- `id` UUID PK
- `group_offer` FK(GroupOffer)
- `leader` FK(User)
- `visit_time` datetime
- `invite_token` string unique  (urlsafe random)
- `status` choice: `forming` | `full` | `scheduled` | `checking_in`
  | `completed` | `expired` | `cancelled` | `failed`
- `reward_code` string nullable unique
- `completed_at` datetime nullable
- `redeemed_at` datetime nullable
- `created_at`, `updated_at`

## GroupMember
- `id` UUID PK
- `group_deal` FK(GroupDeal)
- `customer` FK(User)
- `status` choice: `joined` | `checked_in` | `left` | `no_show` | `removed`
- `checked_in_at` datetime nullable
- `created_at`, `updated_at`
- Constraints: unique (group_deal, customer) · group cannot exceed max size ·
  status transitions update parent GroupDeal status.

## ScanLog
- `id` UUID PK
- `qr_token` FK(QRCodeToken) nullable
- `token_value` string nullable  (raw token even if FK missing)
- `customer` FK(User) nullable
- `business` FK(Business) nullable
- `staff` FK(StaffMember) nullable
- `action` string  (e.g. `collect`, `redeem`, `check_in`, `validate_code`)
- `status` choice: `success` | `failed` | `blocked`
- `failure_reason` string nullable  (use an error code from CONVENTIONS.md)
- `ip_address` string nullable
- `user_agent` string nullable
- `metadata` json nullable
- `created_at`
- Rule: EVERY QR action / code attempt writes a row, success or fail.

## Campaign  (later phase)
- `id` UUID PK · `title` · `description` · `area` · `valid_from` date
  · `valid_to` date · `status` choice(`draft`|`active`|`paused`|`expired`)
  · `created_at`, `updated_at`

## CampaignBusiness  (later)
- `id` UUID PK · `campaign` FK · `business` FK · `offer_description` text
  · `status` choice(`invited`|`joined`|`left`) · `created_at`

## CampaignProgress  (later)
- `id` UUID PK · `campaign` FK · `customer` FK · `progress_count` int
  · `status` choice(`active`|`completed`|`expired`) · `created_at`, `updated_at`
