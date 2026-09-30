"""Role-based permissions: the single declaration every endpoint guard reads.

The standalone app has no Admin Control Center, so roles map to permissions
here, in code, where a change is reviewed like any other. DIM_EMPLOYEE.ROLE_CODE
selects the row; an unknown role gets no permissions (and therefore 403s).
"""
GUIDANCE_VIEW = "guidance.view"
CALL_ASSESS = "call.assess"
USER_IMPERSONATE = "user.impersonate"

ROLE_PERMISSIONS: dict[str, list[str]] = {
    "REP": [GUIDANCE_VIEW, CALL_ASSESS],
    "MANAGER": [GUIDANCE_VIEW, CALL_ASSESS, USER_IMPERSONATE],
}


def permissions_for(role_code: str | None) -> list[str]:
    return list(ROLE_PERMISSIONS.get((role_code or "").upper(), []))
