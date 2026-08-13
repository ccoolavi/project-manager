from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional, List
from models import UserRole, TaskStatus, TaskPriority, ProjectStatus, InviteStatus

# User Schemas
class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(..., min_length=8)
    confirm_password: str

class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    phone: Optional[str] = None
    whatsapp_verified: bool
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse

# Organization Schemas
class OrganizationCreate(BaseModel):
    name: str
    description: Optional[str] = None

class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class OrganizationMemberResponse(BaseModel):
    id: int
    user_id: int
    role: UserRole
    joined_at: datetime
    user: UserResponse

    class Config:
        from_attributes = True

class OrganizationResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    owner_id: int
    created_at: datetime
    members: List[OrganizationMemberResponse] = []

    class Config:
        from_attributes = True

# Project Schemas
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    status: ProjectStatus = ProjectStatus.active

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None

class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    status: ProjectStatus
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True

# SubProject Schemas
class SubProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    status: ProjectStatus = ProjectStatus.active

class SubProjectResponse(BaseModel):
    id: int
    project_id: int
    name: str
    description: Optional[str] = None
    status: ProjectStatus
    created_at: datetime

    class Config:
        from_attributes = True

# Task Schemas
class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: TaskStatus = TaskStatus.todo
    priority: TaskPriority = TaskPriority.medium
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None

class TaskResponse(BaseModel):
    id: int
    sub_project_id: int
    title: str
    description: Optional[str] = None
    status: TaskStatus
    priority: TaskPriority
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True

# Habit Schemas
class HabitCreate(BaseModel):
    title: str
    category: Optional[str] = None
    target_days: int = 7

class HabitUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    target_days: Optional[int] = None

class HabitResponse(BaseModel):
    id: int
    title: str
    category: Optional[str] = None
    target_days: int
    streak: int
    completed_dates: List[str] = []
    created_at: datetime

    class Config:
        from_attributes = True

# Kaizen Log Schemas
class KaizenLogCreate(BaseModel):
    title: str
    problem: Optional[str] = None
    solution: Optional[str] = None
    category: Optional[str] = None

class KaizenLogUpdate(BaseModel):
    title: Optional[str] = None
    problem: Optional[str] = None
    solution: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None

class KaizenLogResponse(BaseModel):
    id: int
    title: str
    problem: Optional[str] = None
    solution: Optional[str] = None
    category: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

# Time Entry Schemas
class TimeEntryCreate(BaseModel):
    task_id: Optional[int] = None
    duration_minutes: int
    category: Optional[str] = None
    date: Optional[datetime] = None

class TimeEntryResponse(BaseModel):
    id: int
    task_id: Optional[int] = None
    duration_minutes: int
    category: Optional[str] = None
    date: datetime
    created_at: datetime

    class Config:
        from_attributes = True

# Invite Schemas
class InviteMember(BaseModel):
    email: EmailStr
    role: UserRole = UserRole.member

class InviteResponse(BaseModel):
    id: int
    email: str
    role: UserRole
    status: InviteStatus
    expires_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True

# OTP Schemas
class RequestOTP(BaseModel):
    phone: str

class VerifyOTP(BaseModel):
    phone: str
    code: str
