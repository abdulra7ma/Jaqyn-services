"""Social-post payload builder for campaigns (social-share feature).

Turns a published/draft campaign into a ready-to-paste social marketing kit:
a headline, the reward title, subtext, a single auto-join deep link, the campaign
image, per-platform captions, and a hashtag set. This is pure presentation logic
derived from campaign + business data — it mutates nothing, so it takes a campaign
and returns a typed :class:`SocialPost` dataclass. Captions mirror the marketing
copy from the design; the Instagram variant is the canonical template and the other
platforms are tone/length tweaks of it.
"""

from __future__ import annotations

from dataclasses import dataclass

from django.conf import settings

from apps.campaigns.models import Campaign

# Fixed call-to-action label shown on the share card button. Source: social-share
# design spec — the button copy is a constant, not derived from campaign data.
_BUTTON_TEXT = "Tap to join · bonus reward"


@dataclass(frozen=True)
class SocialPost:
    """A platform-ready social share kit for one campaign.

    ``captions`` maps a platform key (``instagram``/``tiktok``/``facebook``/
    ``whatsapp``) to its ready-to-paste copy; ``hashtags`` is the shared tag set
    appended to the captions. ``image_url`` is the campaign image's relative media
    url (``/media/campaigns/..``) or ``None`` when no image is set.
    """

    headline: str
    reward_title: str
    subtext: str
    button_text: str
    auto_join_url: str
    image_url: str | None
    captions: dict[str, str]
    hashtags: list[str]


def _hashtags(campaign: Campaign) -> list[str]:
    """Build the hashtag set: business name, optional city, and the brand tag.

    Spaces are stripped from the business name and city so each becomes a single
    ``#tag``. The city tag is omitted when the business has no city. ``#Jaqyn`` is
    always last (the platform brand tag, per the design).
    """
    business = campaign.business
    tags = ["#" + business.name.replace(" ", "")]
    if business.city:
        tags.append("#" + business.city.replace(" ", ""))
    tags.append("#Jaqyn")
    return tags


def _captions(
    *,
    name: str,
    subtext: str,
    reward: str,
    auto_join_url: str,
    business_name: str,
    hashtags: list[str],
) -> dict[str, str]:
    """Render the per-platform caption copy from the shared inputs.

    Instagram is the canonical template from the design; TikTok, Facebook, and
    WhatsApp are lighter tonal variants of the same message (hook → reward →
    auto-join link → brand). Every caption ends with the hashtag block so the
    business can paste it as-is.
    """
    tags = " ".join(hashtags)
    instagram = (
        f"☕ {name} is live at {business_name}!\n\n"
        f"{subtext}\n"
        f"Finish the challenge and unlock {reward} 🎁\n\n"
        f"👉 Tap to auto-join: {auto_join_url}\n"
        f"Tracked for you on Jaqyn @jaqyn.app\n\n"
        f"{tags}"
    )
    tiktok = (
        f"POV: {business_name} just dropped {name} 👀\n"
        f"{subtext}\n"
        f"Finish it → unlock {reward} 🎁\n"
        f"Auto-join, zero cards: {auto_join_url}\n\n"
        f"{tags}"
    )
    facebook = (
        f"{name} is now live at {business_name}. {subtext} "
        f"Complete the challenge and unlock {reward}. "
        f"Tap to auto-join — we track it for you on Jaqyn: {auto_join_url}\n\n"
        f"{tags}"
    )
    whatsapp = (
        f"{name} at {business_name} 🎉\n"
        f"{subtext}\n"
        f"Finish it and get {reward}.\n"
        f"Join here: {auto_join_url}"
    )
    return {
        "instagram": instagram,
        "tiktok": tiktok,
        "facebook": facebook,
        "whatsapp": whatsapp,
    }


def build_social_post(campaign: Campaign) -> SocialPost:
    """Build the social share kit for a campaign (social-share feature).

    Pulls the headline from the campaign name, the reward title from the campaign's
    reward (empty string when no reward is configured yet — a draft may be
    incomplete), and the subtext from the description. The auto-join deep link is
    ``{FRONTEND_URL}/c/{campaign.id}`` so a scan/tap opens the campaign join screen
    on the web app. ``image_url`` is the campaign image's *relative* media url so it
    resolves through the frontend's same-origin proxy, or ``None`` when unset.
    Hashtags and the per-platform captions are derived from the same inputs.
    """
    reward = getattr(campaign, "reward", None)
    reward_title = reward.title if reward is not None else ""
    subtext = campaign.description or ""
    # FRONTEND_URL is required and defaulted in settings.base to the dev origin, so
    # this is always set; reading it via settings keeps the link host configurable.
    auto_join_url = f"{settings.FRONTEND_URL}/c/{campaign.id}"
    image_url = campaign.image.url if campaign.image else None
    hashtags = _hashtags(campaign)
    captions = _captions(
        name=campaign.name,
        subtext=subtext,
        reward=reward_title,
        auto_join_url=auto_join_url,
        business_name=campaign.business.name,
        hashtags=hashtags,
    )
    return SocialPost(
        headline=campaign.name,
        reward_title=reward_title,
        subtext=subtext,
        button_text=_BUTTON_TEXT,
        auto_join_url=auto_join_url,
        image_url=image_url,
        captions=captions,
        hashtags=hashtags,
    )
