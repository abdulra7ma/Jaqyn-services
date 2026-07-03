from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import TokenRefreshView

from apps.businesses.onboarding_views import BusinessTypeListView
from apps.reporting.analytics import analytics_view
from apps.loyalty.scan_views import UnifiedStaffScanView

from core.views import HealthView

urlpatterns = [
    # Custom admin analytics page — must precede admin.site.urls so it resolves
    # first. admin_view gates it to logged-in staff and renders in the admin shell.
    path(
        "admin/analytics/",
        admin.site.admin_view(analytics_view),
        name="admin_analytics",
    ),
    # Custom leads admin tool — must precede admin.site.urls. admin_view gates page
    # access to staff and renders inside the admin shell; the api_* views enforce
    # is_staff themselves (they return JSON 403, not an HTML login redirect).
    path("admin/leads/", include("apps.leads.urls")),
    path("admin/", admin.site.urls),
    path("api/health/", HealthView.as_view(), name="health"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("api/business-types/", BusinessTypeListView.as_view(), name="business-types"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.notifications.urls")),
    path("api/business/", include("apps.businesses.urls")),
    path("api/business/staff/", include("apps.staff.management_urls")),
    path("api/business/", include("apps.reporting.business_urls")),
    # Exact unified scanner must precede the legacy staff include, which also
    # contains a /scan/ route.
    path("api/staff/scan/", UnifiedStaffScanView.as_view()),
    path("api/staff/", include("apps.staff.urls")),
    path("api/qr/", include("apps.qr.urls")),
    path("api/merchant/", include("apps.qr.merchant_urls")),
    path("api/businesses/", include("apps.businesses.public_urls")),
    path("api/customer/", include("apps.qr.customer_urls")),
    path("api/business/campaigns/", include("apps.campaigns.business_urls")),
    path("api/customer/", include("apps.campaigns.customer_urls")),
    path("api/staff/campaigns/", include("apps.campaigns.staff_urls")),
    path("api/business/loyalty/", include("apps.loyalty.business_urls")),
    path("api/customer/loyalty/", include("apps.loyalty.customer_urls")),
    path("api/customer/patches/", include("apps.patches.urls")),
    path("api/staff/loyalty/", include("apps.loyalty.staff_urls")),
    path("api/admin/campaigns/", include("apps.campaigns.admin_urls")),
    path("api/admin/", include("apps.businesses.admin_urls")),
    path("api/admin/", include("apps.reporting.admin_urls")),
    path("api/admin/", include("apps.notifications.admin_urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
