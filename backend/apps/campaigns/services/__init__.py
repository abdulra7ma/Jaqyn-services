"""Public service surface for the campaigns app (plan §1.2).

Implementation is split by responsibility across sibling modules; this entry
file re-exports the public surface so callers import from ``apps.campaigns.services``
and never reach into a sibling module's internals.
"""

from apps.campaigns.services.analytics import (
    CampaignAnalyticsService,
    CampaignMetrics,
    CampaignTypeStats,
)
from apps.campaigns.services.campaign import (
    CampaignService,
    CustomerProgressContext,
    LoyaltyProgramView,
)
from apps.campaigns.services.eligibility import (
    CampaignEligibilityService,
    EligibilityResult,
    IneligibilityReason,
)
from apps.campaigns.services.fraud import FraudService, FraudSignal
from apps.campaigns.services.group import (
    CampaignGroupService,
    GroupConfirmResult,
)
from apps.campaigns.services.progress import (
    CampaignProgressService,
    ProgressResult,
)
from apps.campaigns.services.rewards import CampaignRewardService
from apps.campaigns.services.social import SocialPost, build_social_post
from apps.campaigns.services.scanner import (
    CustomerScanResult,
    EligibleCampaignView,
    SkippedCampaign,
    StaffScannerService,
    UnifiedScanResult,
)

__all__ = [
    "CampaignService",
    "CustomerProgressContext",
    "LoyaltyProgramView",
    "CampaignEligibilityService",
    "EligibilityResult",
    "IneligibilityReason",
    "CampaignProgressService",
    "ProgressResult",
    "CampaignRewardService",
    "SocialPost",
    "build_social_post",
    "StaffScannerService",
    "CustomerScanResult",
    "EligibleCampaignView",
    "SkippedCampaign",
    "UnifiedScanResult",
    "FraudService",
    "FraudSignal",
    "CampaignGroupService",
    "GroupConfirmResult",
    "CampaignAnalyticsService",
    "CampaignMetrics",
    "CampaignTypeStats",
]
