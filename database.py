"""
Database management and seed data for BorrowBox.
Implements relational schema in SQLite with full CRUD and seed data.
"""
import sqlite3
import json
import os
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "borrowbox.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db(force_reset=False):
    if force_reset and os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = get_connection()
    cursor = conn.cursor()

    # 1. Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        fullName TEXT NOT NULL,
        displayName TEXT NOT NULL,
        schoolId TEXT NOT NULL,
        grade TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        avatarUrl TEXT NOT NULL,
        verificationStatus TEXT NOT NULL DEFAULT 'Verified',
        trustScore INTEGER NOT NULL DEFAULT 5,
        role TEXT NOT NULL DEFAULT 'student',
        createdAt TEXT NOT NULL
    );
    """)

    # 2. Schools table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS schools (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT UNIQUE NOT NULL,
        verificationCode TEXT NOT NULL,
        adminId TEXT NOT NULL,
        approvedLocations TEXT NOT NULL -- JSON list
    );
    """)

    # 3. Items table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL,
        schoolId TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        images TEXT NOT NULL, -- JSON list
        condition TEXT NOT NULL,
        maxBorrowDays INTEGER NOT NULL DEFAULT 7,
        terms TEXT NOT NULL,
        deposit REAL NOT NULL DEFAULT 0.0,
        exchangeLocation TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Available',
        createdAt TEXT NOT NULL,
        FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (schoolId) REFERENCES schools(id) ON DELETE CASCADE
    );
    """)

    # 4. BorrowRequests table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS borrow_requests (
        id TEXT PRIMARY KEY,
        itemId TEXT NOT NULL,
        borrowerId TEXT NOT NULL,
        ownerId TEXT NOT NULL,
        startDate TEXT NOT NULL,
        endDate TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        createdAt TEXT NOT NULL,
        FOREIGN KEY (itemId) REFERENCES items(id) ON DELETE CASCADE,
        FOREIGN KEY (borrowerId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 5. Transactions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        requestId TEXT NOT NULL,
        itemId TEXT NOT NULL,
        ownerId TEXT NOT NULL,
        borrowerId TEXT NOT NULL,
        exchangeCode TEXT NOT NULL,
        borrowedAt TEXT NOT NULL,
        dueDate TEXT NOT NULL,
        returnedAt TEXT,
        status TEXT NOT NULL DEFAULT 'Active',
        FOREIGN KEY (requestId) REFERENCES borrow_requests(id) ON DELETE CASCADE,
        FOREIGN KEY (itemId) REFERENCES items(id) ON DELETE CASCADE,
        FOREIGN KEY (ownerId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (borrowerId) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 6. Skills table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        schoolId TEXT NOT NULL,
        skillTitle TEXT NOT NULL,
        description TEXT NOT NULL,
        durationMinutes INTEGER NOT NULL,
        desiredExchange TEXT NOT NULL,
        availability TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (schoolId) REFERENCES schools(id) ON DELETE CASCADE
    );
    """)

    # 7. SkillRequests table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS skill_requests (
        id TEXT PRIMARY KEY,
        skillId TEXT NOT NULL,
        requesterId TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        createdAt TEXT NOT NULL,
        FOREIGN KEY (skillId) REFERENCES skills(id) ON DELETE CASCADE,
        FOREIGN KEY (requesterId) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 8. Reports table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        reporterId TEXT NOT NULL,
        reportedUserId TEXT,
        itemId TEXT,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Open',
        createdAt TEXT NOT NULL,
        FOREIGN KEY (reporterId) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 9. Notifications table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        isRead INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # 10. Community Impact Stats
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS impact_stats (
        id INTEGER PRIMARY KEY,
        itemsReused INTEGER NOT NULL DEFAULT 1248,
        moneySaved REAL NOT NULL DEFAULT 242500.0,
        wasteAvoidedKg REAL NOT NULL DEFAULT 384.0,
        successfulExchanges INTEGER NOT NULL DEFAULT 1248
    );
    """)

    conn.commit()

    # Seed if users table is empty
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        seed_data(conn)

    conn.close()

def seed_data(conn):
    cursor = conn.cursor()
    now = datetime.now()
    now_iso = now.isoformat()
    three_days_ago = (now - timedelta(days=3)).strftime("%Y-%m-%d")
    four_days_later = (now + timedelta(days=4)).strftime("%Y-%m-%d")
    one_week_later = (now + timedelta(days=7)).strftime("%Y-%m-%d")

    # Approved locations for Authpur National Model School
    locations = [
        "School Library Desk",
        "Main Reception Desk",
        "Student Activity Room",
        "Science Lab Counter 2",
        "Athletics Equipment Office"
    ]

    # Seed School
    cursor.execute("""
    INSERT INTO schools (id, name, domain, verificationCode, adminId, approvedLocations)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (
        "school-authpur",
        "Authpur National Model School",
        "authpurmodel.edu",
        "AUTHPUR-2026",
        "user-admin",
        json.dumps(locations)
    ))

    # Seed Users
    users = [
        ("user-maya", "Maya Lin", "Maya Lin", "school-authpur", "Grade 11", "maya.lin@authpurmodel.edu", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80", "Verified", 8, "student", now_iso),
        ("user-aarav", "Aarav Sharma", "Aarav Sharma", "school-authpur", "Grade 12", "aarav.sharma@authpurmodel.edu", "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80", "Verified", 19, "student", now_iso),
        ("user-admin", "Dr. Anita Roy", "Dr. Anita Roy (Principal)", "school-authpur", "Faculty / Admin", "anita.roy@authpurmodel.edu", "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80", "Verified", 50, "school_admin", now_iso),
        ("user-liam", "Liam Vance", "Liam Vance", "school-authpur", "Grade 10", "liam.vance@authpurmodel.edu", "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80", "Verified", 4, "student", now_iso),
        ("user-sofia", "Sofia Chen", "Sofia Chen", "school-authpur", "Grade 11", "sofia.chen@authpurmodel.edu", "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80", "Verified", 14, "student", now_iso),
    ]

    for u in users:
        cursor.execute("""
        INSERT INTO users (id, fullName, displayName, schoolId, grade, email, avatarUrl, verificationStatus, trustScore, role, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, u)

    # Seed Items
    items = [
        (
            "item-casio",
            "user-aarav",
            "school-authpur",
            "Casio FX-991ES Plus Calculator",
            "Study Equipment",
            "Scientific calculator with 417 functions. Essential for Class 11 & 12 Mathematics and Physics. Comes with protective hard slide-on case.",
            json.dumps(["https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?w=600&auto=format&fit=crop&q=80"]),
            "Excellent",
            7,
            "Please return with hard case intact and clean screen.",
            100.0,
            "School Library Desk",
            "OnLoan",
            now_iso
        ),
        (
            "item-physics",
            "user-aarav",
            "school-authpur",
            "Class 10 Physics Reference Book (SL Arora)",
            "Books",
            "Comprehensive solved numericals and concept maps for board examinations. All key formulas highlighted neatly.",
            json.dumps(["https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80"]),
            "Good",
            14,
            "No pen markings on unmarked pages please.",
            0.0,
            "Main Reception Desk",
            "Available",
            now_iso
        ),
        (
            "item-tripod",
            "user-sofia",
            "school-authpur",
            "DSLR Camera Tripod (55-inch Aluminum)",
            "Project Tools",
            "Lightweight 3-way pan head tripod with quick release plate and phone mount adapter. Perfect for media club or science project videos.",
            json.dumps(["https://images.unsplash.com/photo-1516962215378-7fa2e137ae93?w=600&auto=format&fit=crop&q=80"]),
            "Like New",
            5,
            "Keep legs locked when carrying; includes zippered carry bag.",
            200.0,
            "Student Activity Room",
            "Available",
            now_iso
        ),
        (
            "item-paint",
            "user-maya",
            "school-authpur",
            "Acrylic Paint Set & 2 Stretched Canvas Boards",
            "Art Supplies",
            "Brand new 18-tube acrylic colour set plus two 8x10 canvas boards. Donating permanently to any junior student preparing for the Annual Art Gala!",
            json.dumps(["https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&auto=format&fit=crop&q=80"]),
            "Like New",
            30,
            "Available for permanent donation or test borrow.",
            0.0,
            "Student Activity Room",
            "Donated",
            now_iso
        ),
        (
            "item-arduino",
            "user-aarav",
            "school-authpur",
            "Arduino Starter Kit with 30 Sensors & Breadboard",
            "Electronics",
            "Complete microcontroller kit including ultrasonic sensor, servo motor, LCD display, jumper wires, and breadboard for robotics projects.",
            json.dumps(["https://images.unsplash.com/photo-1553406830-ef2513450d76?w=600&auto=format&fit=crop&q=80"]),
            "Excellent",
            7,
            "Store all resistor components in respective compartment slots.",
            150.0,
            "Science Lab Counter 2",
            "Available",
            now_iso
        ),
        (
            "item-headphones",
            "user-liam",
            "school-authpur",
            "Sony WH-CH520 Wireless Study Headphones",
            "Electronics",
            "50-hour battery life with multipoint connection. Great for intense study sessions in the quiet hall or language listening practice.",
            json.dumps(["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80"]),
            "Like New",
            4,
            "Sanitized with electronic alcohol wipes before exchange.",
            100.0,
            "School Library Desk",
            "Available",
            now_iso
        ),
        (
            "item-labcoat",
            "user-sofia",
            "school-authpur",
            "Chemistry Lab Coat & Splash Goggles (Size M)",
            "School Supplies",
            "100% white cotton standard school lab coat with embroidered crest and safety goggles. Freshly laundered.",
            json.dumps(["https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=600&auto=format&fit=crop&q=80"]),
            "Good",
            10,
            "Wash before returning.",
            0.0,
            "Science Lab Counter 2",
            "Available",
            now_iso
        ),
        (
            "item-badminton",
            "user-liam",
            "school-authpur",
            "Yonex Carbonex Badminton Racket Pair + Shuttlecock Tube",
            "Sports",
            "Graphite shaft badminton rackets with fresh grip tape and 3 nylon shuttles. Ready for inter-house sports practice.",
            json.dumps(["https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=600&auto=format&fit=crop&q=80"]),
            "Good",
            3,
            "Keep racket head cover on when not in use.",
            50.0,
            "Athletics Equipment Office",
            "Available",
            now_iso
        ),
        (
            "item-ti84",
            "user-aarav",
            "school-authpur",
            "TI-84 Plus CE Color Graphing Calculator",
            "Study Equipment",
            "Rechargeable battery, high-resolution color backlit display. Preloaded with polynomial solvers and matrix tools.",
            json.dumps(["https://images.unsplash.com/photo-1587145820266-a5951ee6f620?w=600&auto=format&fit=crop&q=80"]),
            "Excellent",
            7,
            "Keep USB charging cable safe in pouch.",
            250.0,
            "School Library Desk",
            "Available",
            now_iso
        ),
        (
            "item-drama-costume",
            "user-maya",
            "school-authpur",
            "Shakespearean Victorian Cape & Felt Beret",
            "Costumes",
            "Velvet maroon cape with gold trim and theatrical beret. Ideal for Annual English Drama Day or costume competitions.",
            json.dumps(["https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80"]),
            "Like New",
            5,
            "Dry clean or gentle hand wash only.",
            0.0,
            "Student Activity Room",
            "Available",
            now_iso
        )
    ]

    for item in items:
        cursor.execute("""
        INSERT INTO items (id, ownerId, schoolId, title, category, description, images, condition, maxBorrowDays, terms, deposit, exchangeLocation, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, item)

    # 1 Active Loan (Casio Calculator borrowed by Maya from Aarav)
    cursor.execute("""
    INSERT INTO borrow_requests (id, itemId, borrowerId, ownerId, startDate, endDate, message, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "req-active-1",
        "item-casio",
        "user-maya",
        "user-aarav",
        three_days_ago,
        four_days_later,
        "Hi Aarav! May I borrow your scientific calculator for our calculus midterms this week? Will return it promptly at the library.",
        "Approved",
        three_days_ago
    ))

    cursor.execute("""
    INSERT INTO transactions (id, requestId, itemId, ownerId, borrowerId, exchangeCode, borrowedAt, dueDate, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "tx-active-1",
        "req-active-1",
        "item-casio",
        "user-aarav",
        "user-maya",
        "482913",
        three_days_ago,
        four_days_later,
        "Active"
    ))

    # 1 Pending Request (Liam wants to borrow Arduino Starter Kit from Aarav)
    cursor.execute("""
    INSERT INTO borrow_requests (id, itemId, borrowerId, ownerId, startDate, endDate, message, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "req-pending-1",
        "item-arduino",
        "user-liam",
        "user-aarav",
        now.strftime("%Y-%m-%d"),
        one_week_later,
        "Hey Aarav! Our STEM Robotics team needs an extra ultrasonic sensor and Arduino board for testing before the Friday exhibition.",
        "Pending",
        now_iso
    ))

    # Seed Skills
    skills = [
        (
            "skill-python",
            "user-aarav",
            "school-authpur",
            "Python Coding Basics (Data structures, loops & mini games)",
            "I can walk you through basic Python syntax, functions, and building a text adventure or calculator project in 30-45 minutes.",
            30,
            "Guitar Chord Lessons or Acoustic Basics",
            "Tuesdays & Thursdays after school 3:30 PM",
            now_iso
        ),
        (
            "skill-physics",
            "user-sofia",
            "school-authpur",
            "AP Physics Mechanics & Free-Body Diagrams",
            "Mastering projectile motion, rotational dynamics, and work-energy theorem. Worked through 50+ past paper problems.",
            45,
            "Help with SAT / Algebra Practice",
            "Lunch breaks at Library Desk (12:45 PM)",
            now_iso
        ),
        (
            "skill-procreate",
            "user-maya",
            "school-authpur",
            "Digital Illustration & Cartoon Character Design in Procreate",
            "Learn digital inking, color palettes, and layer blending techniques on iPad. Beginners welcome!",
            40,
            "French Speaking & Pronunciation Practice",
            "Fridays 4:00 PM in Student Activity Room",
            now_iso
        )
    ]

    for s in skills:
        cursor.execute("""
        INSERT INTO skills (id, userId, schoolId, skillTitle, description, durationMinutes, desiredExchange, availability, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, s)

    # Seed 1 Skill Request
    cursor.execute("""
    INSERT INTO skill_requests (id, skillId, requesterId, message, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (
        "skill-req-1",
        "skill-python",
        "user-liam",
        "Hi Aarav! I know acoustic guitar fundamentals and chord transitions. Would love to trade for help setting up Python loops!",
        "Pending",
        now_iso
    ))

    # Seed 1 Sample Report for Admin Moderation
    cursor.execute("""
    INSERT INTO reports (id, reporterId, reportedUserId, itemId, reason, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        "rep-1",
        "user-liam",
        "user-aarav",
        "item-casio",
        "Listing initially had typo in battery requirement, resolved with owner.",
        "Resolved",
        three_days_ago
    ))

    # Seed Notifications
    notifications = [
        ("notif-1", "user-maya", "return_reminder", "Reminder: Casio FX-991ES Plus is due in 4 days at School Library Desk.", 0, now_iso),
        ("notif-2", "user-aarav", "borrow_request", "Liam Vance requested to borrow your Arduino Starter Kit.", 0, now_iso),
        ("notif-3", "user-aarav", "skill_request", "Liam Vance proposed a Skill Swap: Acoustic Guitar for Python Basics!", 0, now_iso),
        ("notif-4", "user-admin", "system", "School Sustainability Report: Authpur National Model School reached 1,248 items reused milestone!", 0, now_iso)
    ]

    for n in notifications:
        cursor.execute("""
        INSERT INTO notifications (id, userId, type, message, isRead, createdAt)
        VALUES (?, ?, ?, ?, ?, ?)
        """, n)

    # Seed Impact Stats
    cursor.execute("""
    INSERT INTO impact_stats (id, itemsReused, moneySaved, wasteAvoidedKg, successfulExchanges)
    VALUES (1, 1248, 242500.0, 384.0, 1248)
    """)

    conn.commit()

# Query helper utilities
def get_user(user_id: str):
    conn = get_connection()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def get_all_users():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM users ORDER BY createdAt ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def create_user(user_dict: dict):
    conn = get_connection()
    conn.execute("""
    INSERT INTO users (id, fullName, displayName, schoolId, grade, email, avatarUrl, verificationStatus, trustScore, role, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_dict["id"],
        user_dict["fullName"],
        user_dict["displayName"],
        user_dict.get("schoolId", "school-authpur"),
        user_dict.get("grade", "Grade 10"),
        user_dict["email"],
        user_dict.get("avatarUrl", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150"),
        user_dict.get("verificationStatus", "Verified"),
        int(user_dict.get("trustScore", 5)),
        user_dict.get("role", "student"),
        user_dict["createdAt"]
    ))
    conn.commit()
    conn.close()
    return get_user(user_dict["id"])

def update_user(user_id: str, updates: dict):
    conn = get_connection()
    allowed_fields = ["fullName", "displayName", "grade", "email", "avatarUrl", "role"]
    fields = []
    values = []
    for k in allowed_fields:
        if k in updates and updates[k] is not None:
            fields.append(f"{k} = ?")
            values.append(updates[k])
    if fields:
        values.append(user_id)
        query = f"UPDATE users SET {', '.join(fields)} WHERE id = ?"
        conn.execute(query, values)
        conn.commit()
    conn.close()
    return get_user(user_id)

def get_items(category=None, condition=None, search=None, status=None):
    conn = get_connection()
    query = """
    SELECT i.*, u.displayName as ownerName, u.avatarUrl as ownerAvatar, u.trustScore as ownerTrust
    FROM items i
    JOIN users u ON i.ownerId = u.id
    WHERE 1=1
    """
    params = []
    if category and category != "All":
        query += " AND i.category = ?"
        params.append(category)
    if condition and condition != "All":
        query += " AND i.condition = ?"
        params.append(condition)
    if status and status != "All":
        query += " AND i.status = ?"
        params.append(status)
    if search:
        query += " AND (i.title LIKE ? OR i.description LIKE ? OR i.category LIKE ?)"
        term = f"%{search}%"
        params.extend([term, term, term])

    query += " ORDER BY i.createdAt DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()

    result = []
    for r in rows:
        d = dict(r)
        d["images"] = json.loads(d["images"])
        result.append(d)
    return result

def get_item(item_id: str):
    conn = get_connection()
    row = conn.execute("""
    SELECT i.*, u.displayName as ownerName, u.avatarUrl as ownerAvatar, u.trustScore as ownerTrust
    FROM items i
    JOIN users u ON i.ownerId = u.id
    WHERE i.id = ?
    """, (item_id,)).fetchone()
    conn.close()
    if row:
        d = dict(row)
        d["images"] = json.loads(d["images"])
        return d
    return None

def get_transactions_for_user(user_id: str):
    conn = get_connection()
    rows = conn.execute("""
    SELECT t.*, i.title as itemTitle, i.images as itemImages, i.exchangeLocation,
           owner.displayName as ownerName, owner.avatarUrl as ownerAvatar,
           borrower.displayName as borrowerName, borrower.avatarUrl as borrowerAvatar
    FROM transactions t
    JOIN items i ON t.itemId = i.id
    JOIN users owner ON t.ownerId = owner.id
    JOIN users borrower ON t.borrowerId = borrower.id
    WHERE t.borrowerId = ? OR t.ownerId = ?
    ORDER BY t.borrowedAt DESC
    """, (user_id, user_id)).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["itemImages"] = json.loads(d["itemImages"])
        result.append(d)
    return result

def get_requests_for_user(user_id: str):
    conn = get_connection()
    rows = conn.execute("""
    SELECT r.*, i.title as itemTitle, i.images as itemImages, i.deposit, i.exchangeLocation,
           owner.displayName as ownerName, borrower.displayName as borrowerName, borrower.avatarUrl as borrowerAvatar
    FROM borrow_requests r
    JOIN items i ON r.itemId = i.id
    JOIN users owner ON r.ownerId = owner.id
    JOIN users borrower ON r.borrowerId = borrower.id
    WHERE r.borrowerId = ? OR r.ownerId = ?
    ORDER BY r.createdAt DESC
    """, (user_id, user_id)).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["itemImages"] = json.loads(d["itemImages"])
        result.append(d)
    return result

def get_skills():
    conn = get_connection()
    rows = conn.execute("""
    SELECT s.*, u.displayName as userName, u.avatarUrl as userAvatar, u.grade as userGrade, u.trustScore
    FROM skills s
    JOIN users u ON s.userId = u.id
    ORDER BY s.createdAt DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_skill_requests(user_id: str):
    conn = get_connection()
    rows = conn.execute("""
    SELECT sr.*, s.skillTitle, s.userId as ownerId,
           req.displayName as requesterName, req.avatarUrl as requesterAvatar,
           teacher.displayName as teacherName
    FROM skill_requests sr
    JOIN skills s ON sr.skillId = s.id
    JOIN users req ON sr.requesterId = req.id
    JOIN users teacher ON s.userId = teacher.id
    WHERE sr.requesterId = ? OR s.userId = ?
    ORDER BY sr.createdAt DESC
    """, (user_id, user_id)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_impact_metrics():
    conn = get_connection()
    row = conn.execute("SELECT * FROM impact_stats WHERE id = 1").fetchone()
    conn.close()
    if row:
        return dict(row)
    return {"itemsReused": 1248, "moneySaved": 242500.0, "wasteAvoidedKg": 384.0, "successfulExchanges": 1248}

def update_impact_metrics(money_saved_delta=1500.0, waste_kg_delta=1.8):
    conn = get_connection()
    conn.execute("""
    UPDATE impact_stats
    SET itemsReused = itemsReused + 1,
        moneySaved = moneySaved + ?,
        wasteAvoidedKg = wasteAvoidedKg + ?,
        successfulExchanges = successfulExchanges + 1
    WHERE id = 1
    """, (money_saved_delta, waste_kg_delta))
    conn.commit()
    conn.close()
