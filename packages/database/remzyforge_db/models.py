from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def uuid_str() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class Role(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class ProjectMode(str, enum.Enum):
    TEXT_TO_VIDEO = "text_to_video"
    SCRIPT_TO_VIDEO = "script_to_video"
    IMAGE_TO_VIDEO = "image_to_video"
    IMAGE_MOTION = "image_motion"
    TEXT_TO_STORYBOARD = "text_to_storyboard"
    STORYBOARD_TO_VIDEO = "storyboard_to_video"
    VIDEO_TO_VIDEO = "video_to_video"
    CHARACTER_TO_VIDEO = "character_to_video"
    PRODUCT_AD = "product_ad"
    LONGFORM_TO_SHORTS = "longform_to_shorts"


class JobStatus(str, enum.Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    GENERATING = "GENERATING"
    UPSCALING = "UPSCALING"
    RENDERING = "RENDERING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class AspectRatio(str, enum.Enum):
    LANDSCAPE = "16:9"
    VERTICAL = "9:16"
    SQUARE = "1:1"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    memberships: Mapped[list[Membership]] = relationship(back_populates="user")
    audit_logs: Mapped[list[AuditLog]] = relationship(back_populates="user")


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(160))
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)

    memberships: Mapped[list[Membership]] = relationship(back_populates="organization")
    projects: Mapped[list[Project]] = relationship(back_populates="organization")
    subscription: Mapped[Subscription | None] = relationship(back_populates="organization", uselist=False)
    credit_balance: Mapped[CreditBalance | None] = relationship(back_populates="organization", uselist=False)


class Membership(Base, TimestampMixin):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "organization_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    role: Mapped[Role] = mapped_column(Enum(Role, native_enum=False), default=Role.OWNER)

    user: Mapped[User] = relationship(back_populates="memberships")
    organization: Mapped[Organization] = relationship(back_populates="memberships")


class Subscription(Base, TimestampMixin):
    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), unique=True)
    plan: Mapped[str] = mapped_column(String(40), default="free")
    status: Mapped[str] = mapped_column(String(40), default="active")
    renews_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization: Mapped[Organization] = relationship(back_populates="subscription")


class CreditBalance(Base, TimestampMixin):
    __tablename__ = "credit_balances"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), unique=True)
    available: Mapped[int] = mapped_column(Integer, default=100)
    reserved: Mapped[int] = mapped_column(Integer, default=0)

    organization: Mapped[Organization] = relationship(back_populates="credit_balance")


class CreditCost(Base, TimestampMixin):
    __tablename__ = "credit_costs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    operation: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    credits: Mapped[int] = mapped_column(Integer)


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(200))
    idea: Mapped[str] = mapped_column(Text)
    mode: Mapped[ProjectMode] = mapped_column(Enum(ProjectMode, native_enum=False), default=ProjectMode.TEXT_TO_VIDEO)
    aspect_ratio: Mapped[AspectRatio] = mapped_column(Enum(AspectRatio, native_enum=False), default=AspectRatio.VERTICAL)
    target_duration_seconds: Mapped[int] = mapped_column(Integer, default=60)
    status: Mapped[str] = mapped_column(String(40), default="draft")
    script: Mapped[str | None] = mapped_column(Text, nullable=True)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)

    organization: Mapped[Organization] = relationship(back_populates="projects")
    videos: Mapped[list[Video]] = relationship(back_populates="project")
    scenes: Mapped[list[Scene]] = relationship(back_populates="project", order_by="Scene.order_index")
    characters: Mapped[list[Character]] = relationship(back_populates="project")
    styles: Mapped[list[Style]] = relationship(back_populates="project")
    jobs: Mapped[list[GenerationJob]] = relationship(back_populates="project")
    timeline: Mapped[Timeline | None] = relationship(back_populates="project", uselist=False)
    exports: Mapped[list[Export]] = relationship(back_populates="project")


class Video(Base, TimestampMixin):
    __tablename__ = "videos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    duration_seconds: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(40), default="draft")

    project: Mapped[Project] = relationship(back_populates="videos")


class Scene(Base, TimestampMixin):
    __tablename__ = "scenes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(200), default="Scene")
    narration: Mapped[str] = mapped_column(Text, default="")
    visual_prompt: Mapped[str] = mapped_column(Text, default="")
    motion_prompt: Mapped[str] = mapped_column(Text, default="")
    duration_seconds: Mapped[float] = mapped_column(Float, default=5)
    status: Mapped[str] = mapped_column(String(40), default="draft")
    camera_motion: Mapped[str] = mapped_column(String(80), default="static")

    project: Mapped[Project] = relationship(back_populates="scenes")
    shots: Mapped[list[Shot]] = relationship(back_populates="scene")
    assets: Mapped[list[Asset]] = relationship(back_populates="scene")


class Shot(Base, TimestampMixin):
    __tablename__ = "shots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    scene_id: Mapped[str] = mapped_column(ForeignKey("scenes.id", ondelete="CASCADE"), index=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    motion_prompt: Mapped[str] = mapped_column(Text, default="")
    camera_motion: Mapped[str] = mapped_column(String(80), default="static")
    subject_motion: Mapped[str] = mapped_column(Text, default="")
    environment_motion: Mapped[str] = mapped_column(Text, default="")
    facial_expression: Mapped[str] = mapped_column(String(120), default="")
    lighting_motion: Mapped[str] = mapped_column(Text, default="")
    speed: Mapped[float] = mapped_column(Float, default=1.0)
    intensity: Mapped[float] = mapped_column(Float, default=0.5)
    duration: Mapped[float] = mapped_column(Float, default=5)
    start_frame: Mapped[int] = mapped_column(Integer, default=0)
    end_frame: Mapped[int] = mapped_column(Integer, default=120)
    generation_seed: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    negative_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolution: Mapped[str] = mapped_column(String(20), default="1080p")
    fps: Mapped[int] = mapped_column(Integer, default=24)

    scene: Mapped[Scene] = relationship(back_populates="shots")


class Asset(Base, TimestampMixin):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    scene_id: Mapped[str | None] = mapped_column(ForeignKey("scenes.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(40))
    uri: Mapped[str] = mapped_column(String(500))
    mime_type: Mapped[str] = mapped_column(String(80), default="application/octet-stream")
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

    scene: Mapped[Scene | None] = relationship(back_populates="assets")


class Character(Base, TimestampMixin):
    __tablename__ = "characters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    handle: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(120))
    visual_description: Mapped[str] = mapped_column(Text, default="")
    clothing: Mapped[str] = mapped_column(Text, default="")
    age: Mapped[str] = mapped_column(String(40), default="")
    hair: Mapped[str] = mapped_column(String(120), default="")
    facial_features: Mapped[str] = mapped_column(Text, default="")
    color_palette: Mapped[list] = mapped_column(JSON, default=list)
    lighting: Mapped[str] = mapped_column(String(160), default="")
    environment: Mapped[str] = mapped_column(Text, default="")
    reference_images: Mapped[list] = mapped_column(JSON, default=list)

    project: Mapped[Project] = relationship(back_populates="characters")


class Style(Base, TimestampMixin):
    __tablename__ = "styles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    handle: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    reference_images: Mapped[list] = mapped_column(JSON, default=list)

    project: Mapped[Project] = relationship(back_populates="styles")


class Voice(Base, TimestampMixin):
    __tablename__ = "voices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    gender: Mapped[str] = mapped_column(String(20), default="neutral")
    age: Mapped[str] = mapped_column(String(20), default="adult")
    accent: Mapped[str] = mapped_column(String(40), default="neutral")
    style: Mapped[str] = mapped_column(String(40), default="narration")
    model_id: Mapped[str] = mapped_column(String(80), default="mock-tts-v1")


class MusicTrack(Base, TimestampMixin):
    __tablename__ = "music_tracks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(160))
    uri: Mapped[str] = mapped_column(String(500))
    duration_seconds: Mapped[float] = mapped_column(Float, default=0)
    mood: Mapped[str] = mapped_column(String(80), default="")


class GenerationJob(Base, TimestampMixin):
    __tablename__ = "generation_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(40))
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus, native_enum=False), default=JobStatus.QUEUED)
    progress: Mapped[float] = mapped_column(Float, default=0)
    message: Mapped[str] = mapped_column(String(240), default="")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped[Project | None] = relationship(back_populates="jobs")
    attempts: Mapped[list[GenerationAttempt]] = relationship(back_populates="job")


class GenerationAttempt(Base, TimestampMixin):
    __tablename__ = "generation_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    job_id: Mapped[str] = mapped_column(ForeignKey("generation_jobs.id", ondelete="CASCADE"))
    model_id: Mapped[str] = mapped_column(String(80))
    seed: Mapped[str | None] = mapped_column(String(64), nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    success: Mapped[bool] = mapped_column(Boolean, default=False)
    log: Mapped[str] = mapped_column(Text, default="")

    job: Mapped[GenerationJob] = relationship(back_populates="attempts")


class Timeline(Base, TimestampMixin):
    __tablename__ = "timelines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), unique=True)
    tracks: Mapped[dict] = mapped_column(JSON, default=dict)

    project: Mapped[Project] = relationship(back_populates="timeline")


class Caption(Base, TimestampMixin):
    __tablename__ = "captions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    format: Mapped[str] = mapped_column(String(10), default="srt")
    content: Mapped[str] = mapped_column(Text, default="")
    settings: Mapped[dict] = mapped_column(JSON, default=dict)


class Export(Base, TimestampMixin):
    __tablename__ = "exports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    uri: Mapped[str] = mapped_column(String(500), default="")
    aspect_ratio: Mapped[str] = mapped_column(String(10), default="9:16")
    resolution: Mapped[str] = mapped_column(String(20), default="1080p")
    codec: Mapped[str] = mapped_column(String(20), default="h264")
    status: Mapped[str] = mapped_column(String(40), default="pending")

    project: Mapped[Project] = relationship(back_populates="exports")


class ModelRecord(Base, TimestampMixin):
    __tablename__ = "models"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    model_id: Mapped[str] = mapped_column(String(80), unique=True)
    category: Mapped[str] = mapped_column(String(40))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    priority: Mapped[int] = mapped_column(Integer, default=50)
    config: Mapped[dict] = mapped_column(JSON, default=dict)


class PromptTemplate(Base, TimestampMixin):
    __tablename__ = "prompt_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    category: Mapped[str] = mapped_column(String(40))
    body: Mapped[str] = mapped_column(Text)


class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_str)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    organization_id: Mapped[str | None] = mapped_column(ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    resource: Mapped[str] = mapped_column(String(80))
    resource_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

    user: Mapped[User | None] = relationship(back_populates="audit_logs")
