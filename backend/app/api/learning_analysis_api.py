from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_user_id
from app.schemas.learning_analysis import LearningAiRequest, LearningAiResponse
from app.services.learning_analysis_service import create_learning_analysis

router = APIRouter(prefix="/api", tags=["learning-analysis"])


@router.post("/learning-analysis", response_model=LearningAiResponse)
async def learning_analysis(
    payload: LearningAiRequest,
    user_id: str = Depends(get_current_user_id),
) -> LearningAiResponse:
    return await create_learning_analysis(
        payload=payload,
        current_user_id=user_id,
    )