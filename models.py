"""
BorrowBox Pydantic Models and Data Types
Role-based permissions: student, school_admin
"""
from typing import List, Optional
from pydantic import BaseModel, Field

class User(BaseModel):
    id: str
    fullName: str
    displayName: str
    schoolId: str
    grade: str
    email: str
    avatarUrl: str
    verificationStatus: str = "Verified"  # Verified, Pending
    trustScore: int = 5  # Completed exchanges count
    role: str = "student"  # student, school_admin
    createdAt: str

class School(BaseModel):
    id: str
    name: str
    domain: str
    verificationCode: str
    adminId: str
    approvedLocations: List[str]

class Item(BaseModel):
    id: str
    ownerId: str
    schoolId: str
    title: str
    category: str
    description: str
    images: List[str]
    condition: str  # Like New, Excellent, Good, Fair
    maxBorrowDays: int = 7
    terms: str = "Standard school sharing pledge"
    deposit: float = 0.0
    exchangeLocation: str
    status: str = "Available"  # Available, Reserved, OnLoan, Donated
    ownerName: Optional[str] = None
    ownerAvatar: Optional[str] = None
    createdAt: str

class BorrowRequest(BaseModel):
    id: str
    itemId: str
    borrowerId: str
    ownerId: str
    startDate: str
    endDate: str
    message: str
    status: str = "Pending"  # Pending, Approved, Rejected, Extended
    itemTitle: Optional[str] = None
    borrowerName: Optional[str] = None
    ownerName: Optional[str] = None
    createdAt: str

class Transaction(BaseModel):
    id: str
    requestId: str
    itemId: str
    ownerId: str
    borrowerId: str
    exchangeCode: str  # 6-digit random code
    borrowedAt: str
    dueDate: str
    returnedAt: Optional[str] = None
    status: str = "Active"  # Active, Completed, Overdue, Reported
    itemTitle: Optional[str] = None
    ownerName: Optional[str] = None
    borrowerName: Optional[str] = None

class Skill(BaseModel):
    id: str
    userId: str
    schoolId: str
    skillTitle: str
    description: str
    durationMinutes: int
    desiredExchange: str
    availability: str
    userName: Optional[str] = None
    userAvatar: Optional[str] = None
    createdAt: str

class SkillRequest(BaseModel):
    id: str
    skillId: str
    requesterId: str
    message: str
    status: str = "Pending"  # Pending, Accepted, Rejected
    skillTitle: Optional[str] = None
    requesterName: Optional[str] = None
    createdAt: str

class Report(BaseModel):
    id: str
    reporterId: str
    reportedUserId: Optional[str] = None
    itemId: Optional[str] = None
    reason: str
    status: str = "Open"  # Open, Resolved
    itemTitle: Optional[str] = None
    reporterName: Optional[str] = None
    createdAt: str

class Notification(BaseModel):
    id: str
    userId: str
    type: str  # borrow_request, request_approved, return_reminder, skill_request, system
    message: str
    isRead: bool = False
    createdAt: str

class SchoolImpact(BaseModel):
    itemsReused: int
    moneySaved: float
    wasteAvoidedKg: float
    successfulExchanges: int
