from django.contrib import admin

from apps.patches.models import PatchBoardVisit, PatchDef, UserPatch

admin.site.register(PatchDef)
admin.site.register(UserPatch)
admin.site.register(PatchBoardVisit)
