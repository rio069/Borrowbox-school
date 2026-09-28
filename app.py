"""
BorrowBox Backend Application (Starlette + Uvicorn + SQLite)
Full REST API supporting student borrowing, safe exchange codes, skill swaps,
role-based admin moderation, impact analytics, and seed demo reset.
"""
import os
import json
import random
import uuid
from datetime import datetime, timedelta

from starlette.applications import Starlette
from starlette.responses import JSONResponse, HTMLResponse, FileResponse
from starlette.routing import Route, Mount
from starlette.staticfiles import StaticFiles
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

import database

# Current active user store (fallback to user-maya for demo)
ACTIVE_USER_ID = "user-maya"

def get_current_user_id(request):
    global ACTIVE_USER_ID
    user_header = request.headers.get("x-user-id")
    if user_header:
        return user_header
    return ACTIVE_USER_ID

# --- AUTH & PERSONA SWITCHER ---
async def api_get_me(request):
    uid = get_current_user_id(request)
    user = database.get_user(uid)
    if not user:
        user = database.get_user("user-maya")
    
    conn = database.get_connection()
    school = conn.execute("SELECT * FROM schools WHERE id = ?", (user["schoolId"],)).fetchone()
    conn.close()
    school_dict = dict(school) if school else {}
    if school_dict and "approvedLocations" in school_dict:
        school_dict["approvedLocations"] = json.loads(school_dict["approvedLocations"])

    return JSONResponse({
        "user": user,
        "school": school_dict
    })

async def api_get_all_users(request):
    users = database.get_all_users()
    return JSONResponse(users)

async def api_switch_user(request):
    global ACTIVE_USER_ID
    body = await request.json()
    new_uid = body.get("userId", "user-maya")
    user = database.get_user(new_uid)
    if user:
        ACTIVE_USER_ID = new_uid
        return JSONResponse({"status": "success", "user": user})
    return JSONResponse({"status": "error", "message": "User not found"}, status_code=404)

async def api_create_user(request):
    global ACTIVE_USER_ID
    body = await request.json()
    fullName = body.get("fullName", "").strip()
    displayName = body.get("displayName", "").strip() or fullName
    if not fullName:
        return JSONResponse({"error": "Full Name is required"}, status_code=400)

    email = body.get("email", "").strip().lower()
    if not email:
        email = f"{fullName.lower().replace(' ', '.')}@authpurmodel.edu"
    elif "@" not in email:
        email = f"{email}@authpurmodel.edu"

    user_id = f"user-{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now().isoformat()
    avatarUrl = body.get("avatarUrl", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80")

    user_dict = {
        "id": user_id,
        "fullName": fullName,
        "displayName": displayName,
        "schoolId": "school-authpur",
        "grade": body.get("grade", "Grade 11"),
        "email": email,
        "avatarUrl": avatarUrl,
        "verificationStatus": "Verified",
        "trustScore": int(body.get("trustScore", 5)),
        "role": body.get("role", "student"),
        "createdAt": now_iso
    }

    new_user = database.create_user(user_dict)
    ACTIVE_USER_ID = user_id
    return JSONResponse({"status": "success", "user": new_user})

async def api_update_user(request):
    user_id = request.path_params.get("user_id") if "user_id" in request.path_params else get_current_user_id(request)
    body = await request.json()
    updated_user = database.update_user(user_id, body)
    if not updated_user:
        return JSONResponse({"error": "User not found"}, status_code=404)
    return JSONResponse({"status": "success", "user": updated_user})

# --- ITEMS ENDPOINTS ---
async def api_get_items(request):
    category = request.query_params.get("category")
    condition = request.query_params.get("condition")
    status = request.query_params.get("status")
    search = request.query_params.get("q")

    items = database.get_items(category=category, condition=condition, search=search, status=status)
    return JSONResponse(items)

async def api_get_item(request):
    item_id = request.path_params["item_id"]
    item = database.get_item(item_id)
    if not item:
        return JSONResponse({"error": "Item not found"}, status_code=404)
    return JSONResponse(item)

async def api_create_item(request):
    uid = get_current_user_id(request)
    user = database.get_user(uid)
    body = await request.json()

    item_id = f"item-{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now().isoformat()

    images = body.get("images", ["https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80"])
    if not images or len(images) == 0:
        images = ["https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80"]

    conn = database.get_connection()
    conn.execute("""
    INSERT INTO items (id, ownerId, schoolId, title, category, description, images, condition, maxBorrowDays, terms, deposit, exchangeLocation, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        item_id,
        uid,
        user["schoolId"],
        body.get("title", "Untitled Item"),
        body.get("category", "School Supplies"),
        body.get("description", ""),
        json.dumps(images),
        body.get("condition", "Good"),
        int(body.get("maxBorrowDays", 7)),
        body.get("terms", "Standard school pledge"),
        float(body.get("deposit", 0.0)),
        body.get("exchangeLocation", "School Library Desk"),
        body.get("status", "Available"),
        now_iso
    ))
    conn.commit()
    conn.close()

    new_item = database.get_item(item_id)
    return JSONResponse({"status": "success", "item": new_item})

async def api_delete_item(request):
    uid = get_current_user_id(request)
    user = database.get_user(uid)
    item_id = request.path_params["item_id"]
    item = database.get_item(item_id)

    if not item:
        return JSONResponse({"error": "Item not found"}, status_code=404)

    # Only owner or school_admin can delete
    if item["ownerId"] != uid and user.get("role") != "school_admin":
        return JSONResponse({"error": "Unauthorized to remove this listing"}, status_code=403)

    conn = database.get_connection()
    conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
    conn.commit()
    conn.close()

    return JSONResponse({"status": "success", "message": "Item listing removed"})

# --- BORROW REQUESTS & SAFE EXCHANGE WORKFLOW ---
async def api_get_requests(request):
    uid = get_current_user_id(request)
    requests = database.get_requests_for_user(uid)
    return JSONResponse(requests)

async def api_create_request(request):
    uid = get_current_user_id(request)
    user = database.get_user(uid)
    body = await request.json()

    item_id = body.get("itemId")
    item = database.get_item(item_id)
    if not item:
        return JSONResponse({"error": "Item not found"}, status_code=404)

    if item["ownerId"] == uid:
        return JSONResponse({"error": "You cannot borrow your own item!"}, status_code=400)

    req_id = f"req-{uuid.uuid4().hex[:8]}"
    now = datetime.now()
    now_iso = now.isoformat()
    start_date = body.get("startDate", now.strftime("%Y-%m-%d"))
    duration = int(body.get("durationDays", item["maxBorrowDays"]))
    end_date = (now + timedelta(days=duration)).strftime("%Y-%m-%d")

    conn = database.get_connection()
    conn.execute("""
    INSERT INTO borrow_requests (id, itemId, borrowerId, ownerId, startDate, endDate, message, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        req_id,
        item_id,
        uid,
        item["ownerId"],
        start_date,
        end_date,
        body.get("message", "I would love to borrow this for my school coursework."),
        "Pending",
        now_iso
    ))

    # Send notification to owner
    notif_id = f"notif-{uuid.uuid4().hex[:8]}"
    conn.execute("""
    INSERT INTO notifications (id, userId, type, message, isRead, createdAt)
    VALUES (?, ?, ?, ?, 0, ?)
    """, (
        notif_id,
        item["ownerId"],
        "borrow_request",
        f"{user['displayName']} requested to borrow your '{item['title']}'.",
        now_iso
    ))

    conn.commit()
    conn.close()

    return JSONResponse({"status": "success", "requestId": req_id})

async def api_approve_request(request):
    uid = get_current_user_id(request)
    req_id = request.path_params["request_id"]

    conn = database.get_connection()
    req = conn.execute("SELECT * FROM borrow_requests WHERE id = ?", (req_id,)).fetchone()
    if not req:
        conn.close()
        return JSONResponse({"error": "Request not found"}, status_code=404)
    req_dict = dict(req)

    if req_dict["ownerId"] != uid:
        conn.close()
        return JSONResponse({"error": "Only the item owner can approve this request"}, status_code=403)

    # Generate 6-digit exchange code
    exchange_code = str(random.randint(100000, 999999))
    now = datetime.now()
    now_iso = now.isoformat()
    tx_id = f"tx-{uuid.uuid4().hex[:8]}"

    # Update request
    conn.execute("UPDATE borrow_requests SET status = 'Approved' WHERE id = ?", (req_id,))
    # Update item status to Reserved
    conn.execute("UPDATE items SET status = 'Reserved' WHERE id = ?", (req_dict["itemId"],))

    # Create transaction
    conn.execute("""
    INSERT INTO transactions (id, requestId, itemId, ownerId, borrowerId, exchangeCode, borrowedAt, dueDate, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PendingVerification')
    """, (
        tx_id,
        req_id,
        req_dict["itemId"],
        req_dict["ownerId"],
        req_dict["borrowerId"],
        exchange_code,
        now_iso,
        req_dict["endDate"]
    ))

    # Notify borrower with exchange code instruction
    conn.execute("""
    INSERT INTO notifications (id, userId, type, message, isRead, createdAt)
    VALUES (?, ?, 'request_approved', ?, 0, ?)
    """, (
        f"notif-{uuid.uuid4().hex[:8]}",
        req_dict["borrowerId"],
        f"Your request was approved! Meet at the approved school exchange point and enter code {exchange_code} to confirm pickup.",
        now_iso
    ))

    conn.commit()
    conn.close()

    return JSONResponse({
        "status": "success",
        "exchangeCode": exchange_code,
        "transactionId": tx_id
    })

async def api_reject_request(request):
    uid = get_current_user_id(request)
    req_id = request.path_params["request_id"]

    conn = database.get_connection()
    conn.execute("UPDATE borrow_requests SET status = 'Rejected' WHERE id = ? AND ownerId = ?", (req_id, uid))
    conn.commit()
    conn.close()

    return JSONResponse({"status": "success", "message": "Request declined"})

# --- TRANSACTIONS & RETURN CONFIRMATION ---
async def api_get_transactions(request):
    uid = get_current_user_id(request)
    transactions = database.get_transactions_for_user(uid)
    return JSONResponse(transactions)

async def api_verify_exchange_code(request):
    uid = get_current_user_id(request)
    tx_id = request.path_params["tx_id"]
    body = await request.json()
    code_entered = str(body.get("exchangeCode", "")).strip()

    conn = database.get_connection()
    tx = conn.execute("SELECT * FROM transactions WHERE id = ?", (tx_id,)).fetchone()
    if not tx:
        conn.close()
        return JSONResponse({"error": "Transaction not found"}, status_code=404)
    tx_dict = dict(tx)

    # Check match
    if tx_dict["exchangeCode"] != code_entered:
        conn.close()
        return JSONResponse({"error": "Invalid exchange code. Please verify with the owner."}, status_code=400)

    # Activate transaction & mark item as OnLoan
    conn.execute("UPDATE transactions SET status = 'Active' WHERE id = ?", (tx_id,))
    conn.execute("UPDATE items SET status = 'OnLoan' WHERE id = ?", (tx_dict["itemId"],))

    # Send confirmation notifications
    now_iso = datetime.now().isoformat()
    conn.execute("""
    INSERT INTO notifications (id, userId, type, message, isRead, createdAt)
    VALUES (?, ?, 'system', 'Safe exchange verified! Casio Calculator loan is now active.', 0, ?)
    """, (f"notif-{uuid.uuid4().hex[:8]}", tx_dict["ownerId"], now_iso))

    conn.commit()
    conn.close()

    return JSONResponse({"status": "success", "message": "Safe exchange verified! Item is now on loan."})

async def api_mark_returned(request):
    uid = get_current_user_id(request)
    tx_id = request.path_params["tx_id"]

    conn = database.get_connection()
    tx = conn.execute("SELECT * FROM transactions WHERE id = ?", (tx_id,)).fetchone()
    if not tx:
        conn.close()
        return JSONResponse({"error": "Transaction not found"}, status_code=404)
    tx_dict = dict(tx)

    if tx_dict["borrowerId"] != uid:
        conn.close()
        return JSONResponse({"error": "Only the borrower can mark item as returned"}, status_code=403)

    # Set status to ReturnPendingConfirmation
    now_iso = datetime.now().isoformat()
    conn.execute("UPDATE transactions SET status = 'ReturnPendingConfirmation' WHERE id = ?", (tx_id,))

    # Notify owner to confirm receipt
    conn.execute("""
    INSERT INTO notifications (id, userId, type, message, isRead, createdAt)
    VALUES (?, ?, 'system', 'Borrower reported returning item at school exchange desk. Please verify and confirm receipt.', 0, ?)
    """, (f"notif-{uuid.uuid4().hex[:8]}", tx_dict["ownerId"], now_iso))

    conn.commit()
    conn.close()

    return JSONResponse({"status": "success", "message": "Drop-off recorded! Waiting for owner confirmation."})

async def api_confirm_return(request):
    uid = get_current_user_id(request)
    tx_id = request.path_params["tx_id"]

    conn = database.get_connection()
    tx = conn.execute("SELECT * FROM transactions WHERE id = ?", (tx_id,)).fetchone()
    if not tx:
        conn.close()
        return JSONResponse({"error": "Transaction not found"}, status_code=404)
    tx_dict = dict(tx)

    if tx_dict["ownerId"] != uid:
        conn.close()
        return JSONResponse({"error": "Only the owner can confirm return receipt"}, status_code=403)

    now_iso = datetime.now().isoformat()
    # Mark transaction completed
    conn.execute("UPDATE transactions SET status = 'Completed', returnedAt = ? WHERE id = ?", (now_iso, tx_id))
    # Mark item back to Available
    conn.execute("UPDATE items SET status = 'Available' WHERE id = ?", (tx_dict["itemId"],))
    # Increment trust scores for both
    conn.execute("UPDATE users SET trustScore = trustScore + 1 WHERE id IN (?, ?)", (tx_dict["ownerId"], tx_dict["borrowerId"]))
    conn.commit()
    conn.close()

    # Update impact stats
    database.update_impact_metrics(money_saved_delta=1500.0, waste_kg_delta=1.8)

    return JSONResponse({
        "status": "success",
        "message": "Return confirmed! Trust scores increased and community impact updated."
    })

# --- SKILL SWAP MODULE ---
async def api_get_skills(request):
    skills = database.get_skills()
    return JSONResponse(skills)

async def api_create_skill(request):
    uid = get_current_user_id(request)
    user = database.get_user(uid)
    body = await request.json()

    skill_id = f"skill-{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now().isoformat()

    conn = database.get_connection()
    conn.execute("""
    INSERT INTO skills (id, userId, schoolId, skillTitle, description, durationMinutes, desiredExchange, availability, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        skill_id,
        uid,
        user["schoolId"],
        body.get("skillTitle", "Peer Skill"),
        body.get("description", ""),
        int(body.get("durationMinutes", 30)),
        body.get("desiredExchange", "Open to anything"),
        body.get("availability", "After school or lunch"),
        now_iso
    ))
    conn.commit()
    conn.close()

    return JSONResponse({"status": "success", "skillId": skill_id})

async def api_get_skill_requests(request):
    uid = get_current_user_id(request)
    requests = database.get_skill_requests(uid)
    return JSONResponse(requests)

async def api_create_skill_request(request):
    uid = get_current_user_id(request)
    user = database.get_user(uid)
    body = await request.json()

    skill_id = body.get("skillId")
    conn = database.get_connection()
    skill = conn.execute("SELECT * FROM skills WHERE id = ?", (skill_id,)).fetchone()
    if not skill:
        conn.close()
        return JSONResponse({"error": "Skill not found"}, status_code=404)

    req_id = f"skill-req-{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now().isoformat()

    conn.execute("""
    INSERT INTO skill_requests (id, skillId, requesterId, message, status, createdAt)
    VALUES (?, ?, ?, ?, 'Pending', ?)
    """, (
        req_id,
        skill_id,
        uid,
        body.get("message", "Hi! I would love to do this skill exchange."),
        now_iso
    ))

    # Send notification
    conn.execute("""
    INSERT INTO notifications (id, userId, type, message, isRead, createdAt)
    VALUES (?, ?, 'skill_request', ?, 0, ?)
    """, (
        f"notif-{uuid.uuid4().hex[:8]}",
        skill["userId"],
        f"{user['displayName']} proposed a Skill Swap for '{skill['skillTitle']}'.",
        now_iso
    ))

    conn.commit()
    conn.close()

    return JSONResponse({"status": "success", "skillRequestId": req_id})

async def api_respond_skill_request(request):
    req_id = request.path_params["request_id"]
    body = await request.json()
    action = body.get("action", "accept")
    new_status = "Accepted" if action == "accept" else "Rejected"

    conn = database.get_connection()
    conn.execute("UPDATE skill_requests SET status = ? WHERE id = ?", (new_status, req_id))
    conn.commit()
    conn.close()

    return JSONResponse({"status": "success", "status_text": new_status})

# --- IMPACT & ANALYTICS ---
async def api_get_impact(request):
    stats = database.get_impact_metrics()
    # Also attach breakdown
    conn = database.get_connection()
    total_items = conn.execute("SELECT COUNT(*) FROM items").fetchone()[0]
    active_loans = conn.execute("SELECT COUNT(*) FROM transactions WHERE status = 'Active'").fetchone()[0]
    total_skills = conn.execute("SELECT COUNT(*) FROM skills").fetchone()[0]
    conn.close()

    return JSONResponse({
        **stats,
        "activeLoansCount": active_loans,
        "totalCatalogItems": total_items,
        "totalSkillsListed": total_skills,
        "treesEquivalent": round(stats["wasteAvoidedKg"] * 0.05, 1),
        "co2ReducedKg": round(stats["wasteAvoidedKg"] * 2.3, 1)
    })

async def api_get_personal_impact(request):
    uid = get_current_user_id(request)
    conn = database.get_connection()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    borrowed_count = conn.execute("SELECT COUNT(*) FROM transactions WHERE borrowerId = ?", (uid,)).fetchone()[0]
    lent_count = conn.execute("SELECT COUNT(*) FROM transactions WHERE ownerId = ?", (uid,)).fetchone()[0]
    conn.close()

    saved_inr = borrowed_count * 1800.0
    waste_saved_kg = borrowed_count * 2.1

    badges = [
        {"title": "🏆 Community Helper", "description": "Completed first verified school exchange", "unlocked": True},
        {"title": "🌱 Reuse Champion", "description": "Prevented over 5kg of school supplies from landfill", "unlocked": True},
        {"title": "⚡ Fast Returner", "description": "Returned all items on or before the due date", "unlocked": True},
        {"title": "📚 Study Buddy", "description": "Exchanged textbooks and calculators with peers", "unlocked": True}
    ]

    return JSONResponse({
        "user": dict(user) if user else {},
        "itemsBorrowed": borrowed_count,
        "itemsLent": lent_count,
        "moneySaved": saved_inr,
        "wasteAvoidedKg": waste_saved_kg,
        "trustScore": user["trustScore"] if user else 5,
        "badges": badges
    })

# --- ADMIN DASHBOARD & MODERATION ---
async def api_get_reports(request):
    conn = database.get_connection()
    rows = conn.execute("""
    SELECT r.*, u.displayName as reporterName, i.title as itemTitle
    FROM reports r
    JOIN users u ON r.reporterId = u.id
    LEFT JOIN items i ON r.itemId = i.id
    ORDER BY r.createdAt DESC
    """).fetchall()
    conn.close()
    return JSONResponse([dict(r) for r in rows])

async def api_create_report(request):
    uid = get_current_user_id(request)
    body = await request.json()
    rep_id = f"rep-{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now().isoformat()

    conn = database.get_connection()
    conn.execute("""
    INSERT INTO reports (id, reporterId, reportedUserId, itemId, reason, status, createdAt)
    VALUES (?, ?, ?, ?, ?, 'Open', ?)
    """, (
        rep_id,
        uid,
        body.get("reportedUserId"),
        body.get("itemId"),
        body.get("reason", "Inappropriate or missing item"),
        now_iso
    ))
    conn.commit()
    conn.close()

    return JSONResponse({"status": "success", "reportId": rep_id})

async def api_resolve_report(request):
    rep_id = request.path_params["report_id"]
    conn = database.get_connection()
    conn.execute("UPDATE reports SET status = 'Resolved' WHERE id = ?", (rep_id,))
    conn.commit()
    conn.close()
    return JSONResponse({"status": "success", "message": "Report resolved"})

async def api_get_locations(request):
    conn = database.get_connection()
    school = conn.execute("SELECT approvedLocations FROM schools LIMIT 1").fetchone()
    conn.close()
    locations = json.loads(school["approvedLocations"]) if school else []
    return JSONResponse(locations)

async def api_add_location(request):
    body = await request.json()
    new_loc = body.get("location", "").strip()
    if not new_loc:
        return JSONResponse({"error": "Location cannot be blank"}, status_code=400)

    conn = database.get_connection()
    school = conn.execute("SELECT id, approvedLocations FROM schools LIMIT 1").fetchone()
    locations = json.loads(school["approvedLocations"]) if school else []
    if new_loc not in locations:
        locations.append(new_loc)
        conn.execute("UPDATE schools SET approvedLocations = ? WHERE id = ?", (json.dumps(locations), school["id"]))
        conn.commit()
    conn.close()

    return JSONResponse({"status": "success", "locations": locations})

async def api_delete_location(request):
    body = await request.json()
    loc_to_remove = body.get("location", "").strip()

    conn = database.get_connection()
    school = conn.execute("SELECT id, approvedLocations FROM schools LIMIT 1").fetchone()
    locations = json.loads(school["approvedLocations"]) if school else []
    if loc_to_remove in locations:
        locations.remove(loc_to_remove)
        conn.execute("UPDATE schools SET approvedLocations = ? WHERE id = ?", (json.dumps(locations), school["id"]))
        conn.commit()
    conn.close()

    return JSONResponse({"status": "success", "locations": locations})

# --- NOTIFICATIONS ---
async def api_get_notifications(request):
    uid = get_current_user_id(request)
    conn = database.get_connection()
    rows = conn.execute("SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 15", (uid,)).fetchall()
    conn.close()
    return JSONResponse([dict(r) for r in rows])

async def api_mark_notifications_read(request):
    uid = get_current_user_id(request)
    conn = database.get_connection()
    conn.execute("UPDATE notifications SET isRead = 1 WHERE userId = ?", (uid,))
    conn.commit()
    conn.close()
    return JSONResponse({"status": "success"})

# --- RESET DEMO ---
async def api_reset_demo(request):
    database.init_db(force_reset=True)
    return JSONResponse({"status": "success", "message": "BorrowBox demo database reset to initial seed state!"})

# --- FRONTEND HOME PAGE ---
async def serve_index(request):
    index_file = os.path.join(os.path.dirname(__file__), "static", "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return HTMLResponse("<h1>BorrowBox Loading...</h1>")

routes = [
    # Static Assets & Index
    Route("/", serve_index),
    Mount("/static", StaticFiles(directory=os.path.join(os.path.dirname(__file__), "static")), name="static"),

    # Auth & Personas
    Route("/api/auth/me", api_get_me, methods=["GET"]),
    Route("/api/auth/me", api_update_user, methods=["PUT", "PATCH"]),
    Route("/api/auth/users", api_get_all_users, methods=["GET"]),
    Route("/api/auth/switch-user", api_switch_user, methods=["POST"]),
    Route("/api/users", api_create_user, methods=["POST"]),
    Route("/api/users/{user_id}", api_update_user, methods=["PUT", "PATCH"]),

    # Items
    Route("/api/items", api_get_items, methods=["GET"]),
    Route("/api/items", api_create_item, methods=["POST"]),
    Route("/api/items/{item_id}", api_get_item, methods=["GET"]),
    Route("/api/items/{item_id}", api_delete_item, methods=["DELETE"]),

    # Requests & Safe Exchange
    Route("/api/requests", api_get_requests, methods=["GET"]),
    Route("/api/requests", api_create_request, methods=["POST"]),
    Route("/api/requests/{request_id}/approve", api_approve_request, methods=["POST"]),
    Route("/api/requests/{request_id}/reject", api_reject_request, methods=["POST"]),

    # Transactions & Returns
    Route("/api/transactions", api_get_transactions, methods=["GET"]),
    Route("/api/transactions/{tx_id}/verify-code", api_verify_exchange_code, methods=["POST"]),
    Route("/api/transactions/{tx_id}/return", api_mark_returned, methods=["POST"]),
    Route("/api/transactions/{tx_id}/confirm-return", api_confirm_return, methods=["POST"]),

    # Skill Swap
    Route("/api/skills", api_get_skills, methods=["GET"]),
    Route("/api/skills", api_create_skill, methods=["POST"]),
    Route("/api/skills/requests", api_get_skill_requests, methods=["GET"]),
    Route("/api/skills/requests", api_create_skill_request, methods=["POST"]),
    Route("/api/skills/requests/{request_id}/respond", api_respond_skill_request, methods=["POST"]),

    # Impact Analytics
    Route("/api/impact", api_get_impact, methods=["GET"]),
    Route("/api/impact/personal", api_get_personal_impact, methods=["GET"]),

    # Admin Moderation
    Route("/api/admin/reports", api_get_reports, methods=["GET"]),
    Route("/api/reports", api_create_report, methods=["POST"]),
    Route("/api/admin/reports/{report_id}/resolve", api_resolve_report, methods=["POST"]),
    Route("/api/admin/locations", api_get_locations, methods=["GET"]),
    Route("/api/admin/locations", api_add_location, methods=["POST"]),
    Route("/api/admin/locations/remove", api_delete_location, methods=["POST"]),

    # Notifications & Demo Utilities
    Route("/api/notifications", api_get_notifications, methods=["GET"]),
    Route("/api/notifications/mark-read", api_mark_notifications_read, methods=["POST"]),
    Route("/api/reset-demo", api_reset_demo, methods=["POST"]),
]

middleware = [
    Middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
]

app = Starlette(debug=True, routes=routes, middleware=middleware)

if __name__ == "__main__":
    import uvicorn
    database.init_db(force_reset=False)
    port = int(os.environ.get("PORT", 8080))
    print(f"Starting BorrowBox on http://127.0.0.1:{port}")
    uvicorn.run("app:app", host="127.0.0.1", port=port, reload=False)
