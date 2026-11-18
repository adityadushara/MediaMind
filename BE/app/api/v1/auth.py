from fastapi import APIRouter, Depends
from app.core.security import get_current_user, AuthenticatedUser
from app.schemas.common import UserProfileResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/me", response_model=UserProfileResponse)
def get_me(current_user: AuthenticatedUser = Depends(get_current_user)):
    return UserProfileResponse(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role,
        display_name=current_user.email.split("@")[0] if current_user.email else "User"
    )
