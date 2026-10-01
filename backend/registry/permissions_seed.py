"""Role-based permissions: the single declaration every endpoint guard reads.

The standalone app has no Admin Control Center, so roles map to permissions
here, in code, where a change is reviewed like any other. DIM_EMPLOYEE.ROLE_CODE
selects the row; an unknown role gets no permissions (and therefore 403s).

user.impersonate is granted per role by IMPERSONATION_ROLES (default REP and
MANAGER, as the POC offers it to the signed-in rep), so it can be narrowed
per environment without a code change.
"""
from core.config import get_settings

GUIDANCE_VIEW = "guidance.view"
CALL_ASSESS = "call.assess"
USER_IMPERSONATE = "user.impersonate"

ROLE_PERMISSIONS: dict[str, list[str]] = {
    "REP": [GUIDANCE_VIEW, CALL_ASSESS],
    "MANAGER": [GUIDANCE_VIEW, CALL_ASSESS],
}


def permissions_for(role_code: str | None) -> list[str]:
    role = (role_code or "").upper()
    perms = list(ROLE_PERMISSIONS.get(role, []))
    if perms and role in get_settings().impersonation_roles:
        perms.append(USER_IMPERSONATE)
    return perms
