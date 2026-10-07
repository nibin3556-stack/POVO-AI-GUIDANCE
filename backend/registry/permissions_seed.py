"""Role-based permissions: the single declaration every endpoint guard reads.

The standalone app has no Admin Control Center, so roles map to permissions
here, in code, where a change is reviewed like any other. DIM_EMPLOYEE.ROLE_CODE
selects the row; an unknown role gets no permissions (and therefore 403s).

user.impersonate is not a role permission: it goes to the admin users
(ADMIN_USERS_FILE, the same list that configures brands), whatever their role,
so who can impersonate is changed by editing that file.
"""

GUIDANCE_VIEW = "guidance.view"
CALL_ASSESS = "call.assess"
USER_IMPERSONATE = "user.impersonate"

ROLE_PERMISSIONS: dict[str, list[str]] = {
    "REP": [GUIDANCE_VIEW, CALL_ASSESS],
    "MANAGER": [GUIDANCE_VIEW, CALL_ASSESS],
}


def permissions_for(role_code: str | None, is_admin: bool = False) -> list[str]:
    perms = list(ROLE_PERMISSIONS.get((role_code or "").upper(), []))
    if perms and is_admin:
        perms.append(USER_IMPERSONATE)
    return perms
