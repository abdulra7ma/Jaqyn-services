# Mounted at /api/admin/campaigns/ (see config/urls.py). Platform-admin campaign
# endpoints (sponsored / platform-wide campaigns, moderation) are a later phase
# per plan §4 / D8. The urlconf exists now so the include() is wired and future
# admin views drop straight in without touching config/urls.py.
urlpatterns: list = []
