from fastapi import APIRouter

from app.schemas.learning_analysis import LearningAiRequest, LearningAiResponse
from app.services.learning_analysis_service import create_learning_analysis

router = APIRouter(prefix="/api", tags=["learning-analysis"])


@router.post("/learning-analysis", response_model=LearningAiResponse)
async def learning_analysis(payload: LearningAiRequest) -> LearningAiResponse:
    return await create_learning_analysis(payload)