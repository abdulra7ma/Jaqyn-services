from rest_framework.permissions import BasePermission


class HasRole(BasePermission):
    role = None

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == self.role)


class IsCustomer(HasRole):
    role = "customer"


class IsStaff(HasRole):
    role = "staff"


class IsBusinessOwner(HasRole):
    role = "business_owner"


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class IsBusinessOwnerOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.role == "business_owner" or request.user.is_staff)
        )


class IsBusinessOwnerOrStaff(BasePermission):
    """Allow access to a business owner OR a staff member.

    Used for endpoints that sit on the business surface but are also
    legitimately reachable by staff (e.g. voucher cancel, where the button
    renders on the owner page but manager staff also need access).
    """

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in {"business_owner", "staff"}
        )
