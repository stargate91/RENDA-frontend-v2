import sqlite3
import os

db_path = "e:/projects/python/RENDA/data/renda.db"
if not os.path.exists(db_path):
    print("Database does not exist yet. It will be initialized on next startup automatically.")
    exit(0)

print("Migrating database:", db_path)
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 1. Create studios table if not exists
cursor.execute("""
CREATE TABLE IF NOT EXISTS studios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    logo_path TEXT,
    local_logo_path TEXT,
    manual_logo_path TEXT,
    manual_local_logo_path TEXT,
    parent_studio_id INTEGER,
    external_ids TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(parent_studio_id) REFERENCES studios(id) ON DELETE SET NULL
)
""")
cursor.execute("CREATE INDEX IF NOT EXISTS ix_studios_name ON studios(name)")
cursor.execute("CREATE INDEX IF NOT EXISTS ix_studios_parent_studio_id ON studios(parent_studio_id)")

# 2. Add studio_id to media_matches if not exists
cursor.execute("PRAGMA table_info(media_matches)")
columns = [col[1] for col in cursor.fetchall()]

if "studio_id" not in columns:
    print("Adding studio_id column to media_matches...")
    cursor.execute("ALTER TABLE media_matches ADD COLUMN studio_id INTEGER REFERENCES studios(id) ON DELETE SET NULL")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_media_matches_studio_id ON media_matches(studio_id)")
else:
    print("studio_id column already exists.")

# 3. Add suggested_tags to media_matches if not exists
if "suggested_tags" not in columns:
    print("Adding suggested_tags column to media_matches...")
    cursor.execute("ALTER TABLE media_matches ADD COLUMN suggested_tags TEXT")
else:
    print("suggested_tags column already exists.")

conn.commit()
conn.close()
print("Migration completed successfully.")
