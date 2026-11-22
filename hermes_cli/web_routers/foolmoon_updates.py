"""FastAPI routes for Foolmoon's dual safe updater (Hermes Core + Foolmoon App)."""

from __future__ import annotations

import asyncio
from typing import Literal

from fastapi import APIRouter, Body
from pydantic import BaseModel

from hermes_cli.foolmoon_updater import (
    apply_foolmoon_app_update,
    apply_hermes_core_update,
    check_foolmoon_app_update,
    check_hermes_core_update,
    load_manifest,
)

router = APIRouter()


class AppUpdateApplyRequest(BaseModel):
    mode: Literal["auto", "git", "installer"] = "auto"


@router.get("/api/foolmoon/updates/manifest")
async def get_foolmoon_update_manifest():
    return await asyncio.to_thread(load_manifest)


@router.post("/api/foolmoon/updates/hermes/check")
async def post_check_hermes_core():
    return await asyncio.to_thread(check_hermes_core_update)


@router.post("/api/foolmoon/updates/hermes/apply")
async def post_apply_hermes_core():
    return await asyncio.to_thread(apply_hermes_core_update)


@router.post("/api/foolmoon/updates/app/check")
async def post_check_foolmoon_app():
    return await asyncio.to_thread(check_foolmoon_app_update)


@router.post("/api/foolmoon/updates/app/apply")
async def post_apply_foolmoon_app(body: AppUpdateApplyRequest = Body(default_factory=AppUpdateApplyRequest)):
    return await asyncio.to_thread(apply_foolmoon_app_update, mode=body.mode)
