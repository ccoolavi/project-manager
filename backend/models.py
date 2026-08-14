from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, JSON, Enum as SQLEnum
from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime
import enum

# Enums
class UserRole(str, enum.Enum):
    owner = "owner"
    admin = "admin"
    editor = "editor"
    viewer = "viewer"
    member = "member"

class TaskStatus(str, enum.Enum):
    todo = "todo"
    in_progress = "in_progress"
    review = "review"
    done = "done"

class TaskPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"

class ProjectStatus(str, enum.Enum):
    active = "active"
    in_progress = "in_progress"
    completed = "completed"
    archived = "archived"

class InviteStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"

# Models
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    name = Column(String)
    phone = Column(String, nullable=True)
    whatsapp_verified = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    organizations = relationship("Organization", back_populates="owner")
    memberships = relationship("OrganizationMember", back_populates="user")
    created_projects = relationship("Project", back_populates="created_by_user")
    # Task links to users twice (assignee_id and created_by), so the join column
    # must be named explicitly or SQLAlchemy cannot resolve the relationship.
    assigned_tasks = relationship(
        "Task", foreign_keys="Task.assignee_id", back_populates="assignee"
    )
    created_tasks = relationship("Task", foreign_keys="Task.created_by", back_populates="created_by_user")
    habits = relationship("Habit", back_populates="user")
    kaizen_logs = relationship("KaizenLog", back_populates="user")
    time_entries = relationship("TimeEntry", back_populates="user")

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True)
    name = Column(String, index=True)
    description = Column(Text, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    owner = relationship("User", back_populates="organizations")
    members = relationship("OrganizationMember", back_populates="organization", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="organization", cascade="all, delete-orphan")
    habits = relationship("Habit", back_populates="organization", cascade="all, delete-orphan")
    kaizen_logs = relationship("KaizenLog", back_populates="organization", cascade="all, delete-orphan")
    invites = relationship("OrganizationInvite", back_populates="organization", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="organization", cascade="all, delete-orphan")

class OrganizationMember(Base):
    __tablename__ = "organization_members"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    role = Column(SQLEnum(UserRole), default=UserRole.member)
    joined_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="members")
    user = relationship("User", back_populates="memberships")

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"))
    name = Column(String, index=True)
    description = Column(Text, nullable=True)
    status = Column(SQLEnum(ProjectStatus), default=ProjectStatus.active)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="projects")
    created_by_user = relationship("User", back_populates="created_projects")
    sub_projects = relationship("SubProject", back_populates="project", cascade="all, delete-orphan")

class SubProject(Base):
    __tablename__ = "sub_projects"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    name = Column(String, index=True)
    description = Column(Text, nullable=True)
    status = Column(SQLEnum(ProjectStatus), default=ProjectStatus.active)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="sub_projects")

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True)
    sub_project_id = Column(Integer, ForeignKey("sub_projects.id"))
    title = Column(String, index=True)
    description = Column(Text, nullable=True)
    status = Column(SQLEnum(TaskStatus), default=TaskStatus.todo)
    priority = Column(SQLEnum(TaskPriority), default=TaskPriority.medium)
    assignee_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    due_date = Column(DateTime, nullable=True)
    start_date = Column(DateTime, nullable=True)
    story_points = Column(Integer, default=0)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    assignee = relationship("User", foreign_keys=[assignee_id], back_populates="assigned_tasks")
    created_by_user = relationship("User", foreign_keys=[created_by], back_populates="created_tasks")
    time_entries = relationship("TimeEntry", back_populates="task", cascade="all, delete-orphan")
    comments = relationship("TaskComment", back_populates="task", cascade="all, delete-orphan")
    # Dependencies this task is waiting on. TaskDependency.task_id is "the
    # blocked task" and depends_on_id is "the blocking task", so this side of
    # the relationship must be pinned to task_id explicitly.
    dependencies = relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.task_id",
        cascade="all, delete-orphan",
    )

    @property
    def comment_count(self):
        return len(self.comments)

    @property
    def blocked(self):
        """True while any task this one depends on is not yet done."""
        return any(
            dep.depends_on and dep.depends_on.status != TaskStatus.done
            for dep in self.dependencies
        )

class TaskComment(Base):
    __tablename__ = "task_comments"

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    task = relationship("Task", back_populates="comments")
    user = relationship("User")

class TaskDependency(Base):
    """`task_id` cannot proceed until `depends_on_id` reaches done."""

    __tablename__ = "task_dependencies"

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), index=True)
    depends_on_id = Column(Integer, ForeignKey("tasks.id"), index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Only the "blocking task" side is navigated (see Task.blocked); the
    # "blocked task" side already exists via Task.dependencies, so a second
    # relationship back onto task_id here would just create an unused,
    # overlapping mapping.
    depends_on = relationship("Task", foreign_keys=[depends_on_id])

class Habit(Base):
    __tablename__ = "habits"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String, index=True)
    category = Column(String, nullable=True)
    target_days = Column(Integer, default=7)
    streak = Column(Integer, default=0)
    # MutableList is required: a plain JSON column does not detect in-place
    # ``.append(...)``, so habit check-ins were silently never persisted.
    completed_dates = Column(MutableList.as_mutable(JSON), default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="habits")
    user = relationship("User", back_populates="habits")

class KaizenLog(Base):
    __tablename__ = "kaizen_logs"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String, index=True)
    problem = Column(Text, nullable=True)
    solution = Column(Text, nullable=True)
    category = Column(String, nullable=True)
    status = Column(String, default="planned")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="kaizen_logs")
    user = relationship("User", back_populates="kaizen_logs")

class TimeEntry(Base):
    __tablename__ = "time_entries"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    duration_minutes = Column(Integer)
    category = Column(String, nullable=True)
    date = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    task = relationship("Task", back_populates="time_entries")
    user = relationship("User", back_populates="time_entries")

class OrganizationInvite(Base):
    __tablename__ = "organization_invites"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"))
    email = Column(String, index=True)
    role = Column(SQLEnum(UserRole), default=UserRole.member)
    status = Column(SQLEnum(InviteStatus), default=InviteStatus.pending)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    expires_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="invites")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String)  # created, updated, deleted, invited, removed
    entity_type = Column(String)  # task, project, user, org, etc
    entity_id = Column(Integer)
    changes = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="audit_logs")

class OTPSession(Base):
    __tablename__ = "otp_sessions"

    id = Column(Integer, primary_key=True)
    phone = Column(String, index=True)
    otp_hash = Column(String)
    expires_at = Column(DateTime)
    verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Ikigai(Base):
    """A person's ikigai: the four overlapping questions, plus the purpose
    statement they draw from them. One record per person per organisation."""

    __tablename__ = "ikigai"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    love = Column(Text, nullable=True)
    good_at = Column(Text, nullable=True)
    world_needs = Column(Text, nullable=True)
    paid_for = Column(Text, nullable=True)
    purpose = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TrustedDevice(Base):
    """A browser/device that has already completed an email-OTP challenge for
    this user. Login from a known device skips the OTP step; the id is a
    client-generated value persisted in localStorage, not tied to IP or
    fingerprinting, so it survives normal network changes."""

    __tablename__ = "trusted_devices"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    device_id = Column(String, index=True)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_seen_at = Column(DateTime, default=datetime.utcnow)


class EmailOTP(Base):
    """One-time codes sent by email, for two purposes:

    - ``login_device``: challenge issued before a login on an unrecognised
      device completes.
    - ``sensitive_action``: a short-lived re-verification required immediately
      before a destructive action, independent of login state.
    """

    __tablename__ = "email_otps"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    purpose = Column(String)
    otp_hash = Column(String)
    expires_at = Column(DateTime)
    verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Notification(Base):
    """In-app notifications, delivered by polling rather than a push channel
    — see main_agent_prompt.md Part B3: polling every 30s is sufficient for
    this self-hosted, single-server setup and needs no WebSocket machinery."""

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), index=True)
    type = Column(String)  # task_assigned | comment_added | invite_received
    title = Column(String)
    message = Column(Text)
    entity_type = Column(String, nullable=True)
    entity_id = Column(Integer, nullable=True)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Sprint(Base):
    __tablename__ = "sprints"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), index=True)
    name = Column(String)
    goal = Column(Text, nullable=True)
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    status = Column(String, default="planning")  # planning | active | completed
    created_at = Column(DateTime, default=datetime.utcnow)

    tasks = relationship("SprintTask", back_populates="sprint", cascade="all, delete-orphan")


class SprintTask(Base):
    __tablename__ = "sprint_tasks"

    id = Column(Integer, primary_key=True)
    sprint_id = Column(Integer, ForeignKey("sprints.id"), index=True)
    # unique: a task can be in at most one sprint at a time.
    task_id = Column(Integer, ForeignKey("tasks.id"), unique=True, index=True)

    sprint = relationship("Sprint", back_populates="tasks")
    task = relationship("Task")


class ProjectRole(str, enum.Enum):
    viewer = "viewer"
    editor = "editor"


class ProjectMember(Base):
    """Grants one user access to exactly one project, independent of
    OrganizationMember. Does not add the user to the org roster and does
    not appear anywhere OrganizationMember does."""

    __tablename__ = "project_members"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    role = Column(SQLEnum(ProjectRole), default=ProjectRole.viewer)
    invited_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project")
    user = relationship("User", foreign_keys=[user_id])
