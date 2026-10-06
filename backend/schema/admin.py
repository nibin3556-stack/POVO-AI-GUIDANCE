"""Admin request bodies: brands and their features."""
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class BrandSave(BaseModel):
    brand_code: str = Field(min_length=2, max_length=20, pattern=r"^[A-Za-z][A-Za-z0-9_]*$")
    brand_name: str = Field(min_length=1, max_length=80)
    description: Optional[str] = Field(default=None, max_length=400)
    is_active: bool = True
    sort_order: Optional[int] = Field(default=None, ge=0, le=999)

    @field_validator("brand_code")
    @classmethod
    def _upper(cls, value: str) -> str:
        # The pattern already rules out a leading "_" (reserved for _ALL).
        return value.strip().upper()


class FeatureSave(BaseModel):
    #: FEATURE_CODE -> on/off. Only the features sent are changed.
    features: dict[str, bool] = Field(min_length=1, max_length=50)
