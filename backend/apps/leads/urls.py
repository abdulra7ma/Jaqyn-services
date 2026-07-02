from django.urls import path

from apps.leads import views

# Mounted under /admin/leads/ in config/urls.py, each wrapped by admin_view.
urlpatterns = [
    path("", views.leads_page, name="leads_page"),
    path("api/table/", views.api_table, name="leads_api_table"),
    path("api/upload/", views.api_upload, name="leads_api_upload"),
    path("api/rows/", views.api_rows, name="leads_api_rows"),
    path("api/rows/<int:pk>/", views.api_row, name="leads_api_row"),
    path("api/columns/", views.api_columns, name="leads_api_columns"),
    path("api/columns/<int:pk>/", views.api_column, name="leads_api_column"),
]
