---
title: Backend Data Model
service: backend
type: reference
status: active
last_reviewed: 2026-06-30---

# Backend Data Model

Canonical schema, from each app's `models.py`. All models inherit UUID primary
keys; `TimeStampedModel` adds `created_at` (auto-add) + `updated_at` (auto-now),
`UUIDModel` adds only the UUID PK (`core/fields.py`). `USE_TZ=True` — all
datetimes UTC. Choice values shown are the exact strings stored.

## accounts (`apps/accounts/models.py`)

### User (`AbstractBaseUser`, `PermissionsMixin`, `TimeStampedModel`)
`USERNAME_FIELD = phone`. Fields: `phone` (unique, nullable), `name`, `email`
(unique, nullable), `role`, `is_active`, `is_staff`, `is_phone_verified`,
`is_email_verified`, `avatar`, `avatar_emoji`.
- Role: `customer` · `business_owner` · `staff` · `admin` (default `customer`).
- Manager requires phone **or** email.

### CustomerProfile (`TimeStampedModel`)
`user` (O2O → User). Fields: `birthday`, `language` (`ru`/`en`/`ky`, default
`ru`), `marketing_opt_in`, `onboarding_completed`, `profile_completed`.

## businesses (`apps/businesses/models.py`)

### BusinessType
`key` (unique), `name`, `glyph`, `description`, `module` (`menu`/`services`/
`products`/`plans`, default `services`), `sort_order`, `is_active`.

### Business (`TimeStampedModel`)
`owner` (O2O → User, PROTECT, nullable); `pending_owner_name/email` for
pre-activation. `business_code` (unique, auto 8-char). Profile: `name`,
`legal_name`, `category`, `business_type` (BusinessType.key), `description`,
location (`address`, `area`, `city`, `country` default Kyrgyzstan, `latitude`,
`longitude`), contact (`phone`, `public_email`, `website_url`, `instagram_url`),
branding (`logo`+`logo_set`, `cover_image`+`cover_set`, `glyph`, `accent_color`
default `#C25E3C`, `price_level`), `tags` (JSON), `working_hours` (JSON),
`menu_style`, `default_currency` (KGS), `default_language`, `timezone`
(Asia/Bishkek). Lifecycle/audit: `change_note`, `submitted_at`, `verified_at`,
`published_at`, `is_demo`, `is_paid`, `trial_started_at`, `trial_ends_at`.
- Status: `pending`/`approved`/`rejected`/`disabled`.
- OnboardingStatus: `not_started`/`in_progress`/`submitted`/`changes_requested`/`completed`.
- VerificationStatus: `pending_verification`/`verified`/`rejected`/`suspended`.
- VisibilityStatus: `draft`/`hidden`/`published`/`unpublished`.

### BusinessNote (`TimeStampedModel`)
Onboarding/review timeline. `business` (FK), `author` (FK User, SET_NULL), `kind`
(`internal`/`changes_requested`/`status_change`), `body`, `status_at_note`.
Ordered newest-first.

### CatalogItem (`TimeStampedModel`)
`business` (FK). `module` (default `menu`), `name`, `category`, `price` (display
string), `duration`, `sort_order`, `is_active`, `image`.

### BusinessImage (`TimeStampedModel`)
Gallery. `business` (FK), `image`, `caption`, `sort_order`. Max 8 per business
(enforced in service; `GALLERY_LIMIT_REACHED`).

### StaffInvite (`TimeStampedModel`)
`business` (FK), `full_name`, `contact` (email/phone), `role`
(`manager`/`staff`/`viewer`), `status` (`pending`/`accepted`/`expired`/
`cancelled`), `token_hash`, `expires_at`, `accepted_at`.

### BusinessOwnerInvite (`TimeStampedModel`)
`business` (FK), `email`, `phone`, `token_hash` (unique), `status`
(`pending`/`accepted`/`expired`/`cancelled`), `expires_at`, `accepted_at`.

## campaigns (`apps/campaigns/models.py`)

### Campaign (`TimeStampedModel`)
`business` (FK PROTECT), `created_by` (FK User SET_NULL), `name`, `description`,
`image`, `campaign_type` (`individual`/`group`/`social`), `status`
(`draft`/`scheduled`/`active`/`paused`/`ended`/`cancelled`, default `draft`),
`start_at`, `end_at`, `active_days` (JSON), `active_start_time`/`active_end_time`,
`max_participants`, `max_rewards`, `completion_limit_per_customer`
(`once`/`repeatable`), `auto_join_enabled`, `allow_multiple_campaign_counting`,
`instagram_handle`, `ending_warned_at`.

### CampaignRule (`TimeStampedModel`)
`campaign` (O2O). `rule_type` (`visit_count`/`time_window`/`group_checkin`),
`mechanic` (`visit`), `required_count`, `minimum_time_between_actions`
(Duration), `max_count_per_day`, `required_group_size`,
`group_checkin_window_minutes`, `window_before_time`.

### CampaignReward (`TimeStampedModel`)
`campaign` (O2O). `reward_type` (`free_item`/`discount`/`upgrade`/`custom`),
`title`, `description`, `estimated_cost` (Decimal), `expiry_days_after_unlock`,
`max_redemptions`, `reward_receiver_type` (`leader`/`every_member`/`table`),
`item_selection` (`fixed`/`customer`), `catalog_item` (FK SET_NULL).

### CampaignParticipant (`TimeStampedModel`)
`campaign` (FK), `customer` (FK User PROTECT). `status`
(`joined`/`in_progress`/`completed`/`redeemed`), `progress_count`,
`follower_count`, `completion_cycle`, `joined_at`, `completed_at`,
`last_progress_at`. Unique `(campaign, customer)`.

### CampaignAction (`TimeStampedModel`)
`campaign`, `participant`, `customer`, `business` (all PROTECT). `action_type`
(`visit`/`group_checkin`/`social_proof`/`referral`), `verified_by_staff` (FK
StaffMember SET_NULL), `verification_method` (`staff_scan`/`staff_manual`/
`auto_join`), `action_time`, `status` (`counted`/`rejected`/`flagged`),
`metadata` (JSON).

### CampaignRewardVoucher (`TimeStampedModel`)
`campaign`, `customer`, `business`, `reward` (PROTECT), `participant` (nullable),
`catalog_item` (SET_NULL), `voucher_code` (unique), `qr_token` (FK QRCodeToken
SET_NULL), `status` (`active`/`redeemed`/`expired`/`cancelled`), `issued_at`,
`expires_at`, `redeemed_at`, `redeemed_by_staff`, `cancel_reason`,
`expiry_warned_at`.

### Group (`TimeStampedModel`)
`campaign` (FK PROTECT), `group_leader` (FK User PROTECT). `status`
(`forming`/`full`/`checking_in`/`completed`/`expired`/`cancelled`),
`required_size`, `invite_token` (unique), `visit_time`, `name`, `note`,
`expires_at`, `completed_at`.

### GroupMember (`TimeStampedModel`)
`group` (FK), `customer` (FK User PROTECT). `status`
(`joined`/`checked_in`/`left`/`no_show`), `joined_at`, `checked_in_at`. Unique
`(group, customer)`.

## loyalty (`apps/loyalty/models.py`)

### LoyaltyProgram (`TimeStampedModel`)
`business` (FK PROTECT), `created_by` (FK User SET_NULL). `type`
(`points`/`stamp`/`visit`), `status` (`active`/`paused`/`archived`), `name`,
`description`, `image`. Points config: `points_basis` (`visit`/`spend`),
`points_per_visit`, `points_per_som` (Decimal), `cashback_per_point` (Decimal),
`min_redeem_points`, `max_banked`. Stamp/visit: `required_count`. Reward:
`reward_type` (`free_item`/`discount`/`upgrade`/`cashback`), `reward_title`,
`reward_description`, `reward_expiry_days` (default 30), `item_selection`
(`fixed`/`customer`), `catalog_item` (SET_NULL). Schedule: `active_days` (JSON),
`active_start_time`, `active_end_time`.

### LoyaltyMembership (`TimeStampedModel`)
`program` (FK), `customer` (FK User PROTECT). `status` (`active`/`inactive`),
`stamps_count`, `visits_count`, `points_balance`, `current_spend` (Decimal),
`cycle`, `joined_at`, `last_activity_at`. Unique `(program, customer)`.

### LoyaltyTransaction (`UUIDModel`)
`membership` (FK), `program`/`customer`/`business` (PROTECT). `kind`
(`earn`/`redeem`/`adjust`/`reverse`), `source` (`staff_scan`/`admin`/`system`),
`points_delta`, `stamps_delta`, `bill_amount` (Decimal), `staff` (SET_NULL),
`metadata` (JSON), `created_at` (indexed).

### LoyaltyVoucher (`UUIDModel`)
`membership` (FK), `program`/`customer`/`business` (PROTECT), `voucher_code`
(unique), `status` (`active`/`redeemed`/`expired`/`cancelled`), `reward_type`
(LoyaltyProgram.RewardType), `reward_title`, `cashback_amount` (Decimal),
`catalog_item` (SET_NULL), `qr_token` (SET_NULL), `issued_at`, `expires_at`,
`redeemed_at`, `redeemed_by_staff`, `expiry_warned_at`.

## notifications (`apps/notifications/models.py`)

### NotificationPreference (`TimeStampedModel`)
`user` (O2O). Channels: `sms_enabled` (default on), `email_enabled`,
`telegram_enabled`, `whatsapp_enabled`. Events: `reward_updates`,
`group_reminders`, `business_reports`, `campaign_updates`.

### NotificationLog (`UUIDModel`)
`recipient` (FK User SET_NULL), `channel`, `event`, `status`
(`sent`/`failed`/`skipped`), `payload` (JSON), `error`, `created_at`.

## qr (`apps/qr/models.py`)

### QRCodeToken (`UUIDModel`)
`token` (unique, indexed), `type` (`merchant_collect`/`customer_profile`/
`reward_redeem`/`group_invite`/`group_checkin`/`group_reward`/`campaign`/
`campaign_reward`/`loyalty_reward`), `business` (FK CASCADE, nullable),
`customer` (FK CASCADE, nullable), `campaign` (UUIDField, nullable),
`expires_at`, `is_active`, `created_at`.

### ApprovalCode (`UUIDModel`)
`business` (FK), `code`, `valid_from`, `valid_to`, `is_active`, `created_at`.

### ScanLog (`UUIDModel`)
`qr_token` (SET_NULL), `token_value`, `customer`/`business`/`staff` (SET_NULL),
`action`, `status` (`success`/`failed`/`blocked`), `failure_reason`,
`ip_address`, `user_agent`, `metadata` (JSON), `created_at`.

## reporting (`apps/reporting/models.py`)

### AdminAuditLog (`UUIDModel`)
`admin` (FK User SET_NULL), `action`, `target_type`, `target_id`, `reason`,
`metadata` (JSON), `created_at`.

## staff (`apps/staff/models.py`)

### StaffMember (`TimeStampedModel`)
`business` (FK CASCADE), `user` (FK User SET_NULL, nullable), `name`,
`pin_hash`, `role` (`cashier`/`manager`, default `cashier`), `is_active`.

## system (`apps/system/models.py`)

### SystemConfiguration (singleton, pk=1)
`max_active_groups_per_user` (default 3), `trial_period_days` (default 30),
`updated_at`. Load via `SystemConfiguration.load()`.
