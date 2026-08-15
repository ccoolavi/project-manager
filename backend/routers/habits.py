from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from schemas import HabitCreate, HabitUpdate, HabitResponse
from models import Habit
from middleware.auth import get_current_user

# Habits are strictly personal: never scoped to an organization, never
# visible or shareable with anyone else. Every route here filters by the
# caller's own user_id and nothing else — there is no org_id in the path.
router = APIRouter(prefix="/api/habits", tags=["habits"])


@router.post("", response_model=HabitResponse)
async def create_habit(
    habit_data: HabitCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a habit"""
    user_id = int(current_user.get("sub"))

    new_habit = Habit(
        user_id=user_id,
        title=habit_data.title,
        category=habit_data.category,
        target_days=habit_data.target_days
    )
    db.add(new_habit)
    db.commit()
    db.refresh(new_habit)

    return HabitResponse.from_orm(new_habit)


@router.get("", response_model=List[HabitResponse])
async def list_habits(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List the caller's own habits"""
    user_id = int(current_user.get("sub"))

    habits = db.query(Habit).filter(Habit.user_id == user_id).all()

    return [HabitResponse.from_orm(h) for h in habits]


@router.get("/{habit_id}", response_model=HabitResponse)
async def get_habit(
    habit_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get habit details"""
    user_id = int(current_user.get("sub"))

    habit = db.query(Habit).filter(
        Habit.id == habit_id,
        Habit.user_id == user_id
    ).first()

    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    return HabitResponse.from_orm(habit)


@router.put("/{habit_id}", response_model=HabitResponse)
async def update_habit(
    habit_id: int,
    habit_data: HabitUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update habit"""
    user_id = int(current_user.get("sub"))

    habit = db.query(Habit).filter(
        Habit.id == habit_id,
        Habit.user_id == user_id
    ).first()

    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    if habit_data.title:
        habit.title = habit_data.title
    if habit_data.category is not None:
        habit.category = habit_data.category
    if habit_data.target_days:
        habit.target_days = habit_data.target_days

    db.commit()
    db.refresh(habit)

    return HabitResponse.from_orm(habit)


@router.delete("/{habit_id}")
async def delete_habit(
    habit_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete habit"""
    user_id = int(current_user.get("sub"))

    habit = db.query(Habit).filter(
        Habit.id == habit_id,
        Habit.user_id == user_id
    ).first()

    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    db.delete(habit)
    db.commit()

    return {"message": "Habit deleted"}


@router.post("/{habit_id}/check")
async def check_habit(
    habit_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark habit as completed today"""
    user_id = int(current_user.get("sub"))

    habit = db.query(Habit).filter(
        Habit.id == habit_id,
        Habit.user_id == user_id
    ).first()

    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")

    today = datetime.utcnow().date().isoformat()
    if today not in habit.completed_dates:
        habit.completed_dates.append(today)
        habit.streak += 1
        db.commit()
        db.refresh(habit)

    return HabitResponse.from_orm(habit)
