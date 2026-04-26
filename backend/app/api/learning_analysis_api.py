from fastapi import APIRouter, Depends, status

from app.dependencies.auth import get_current_user_id
from app.schemas.learning_analysis import LearningAiRequest, LearningAiResponse
from app.services.learning_analysis_service import create_learning_analysis

router = APIRouter(prefix="/api", tags=["learning-analysis"])


@router.post(
    "/learning-analysis",
    response_model=LearningAiResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_200_OK,
    summary="Create learning AI analysis",
    description=(
        "Creates a scoped AI learning analysis for student tracker, "
        "teacher course assistant, or teacher student assistant. "
        "Authentication is required; role and scope validation must be enforced "
        "inside the learning analysis service layer."
    ),
)
async def learning_analysis(
    payload: LearningAiRequest,
    user_id: str = Depends(get_current_user_id),
) -> LearningAiResponse:
    return await create_learning_analysis(
        payload=payload,
        current_user_id=user_id,
    )