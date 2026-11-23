package com.foolmoon.mobile.memory

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import kotlin.math.exp

data class MemoryEntry(
    val id: String,
    val content: String,
    val category: String = "fact",
    val tags: List<String> = emptyList(),
    val importance: Double = 0.6,
    val pinned: Boolean = false,
    val deleted: Boolean = false,
    val source: String = "android",
    val createdAtMs: Long = System.currentTimeMillis(),
    val updatedAtMs: Long = System.currentTimeMillis(),
    val dirty: Boolean = true
) {
    fun toSyncJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("content", content)
        put("category", category)
        put("tags", JSONArray(tags))
        put("importance", importance)
        put("pinned", pinned)
        put("deleted", deleted)
        put("source", source)
        put("createdAtMs", createdAtMs)
        put("updatedAtMs", updatedAtMs)
    }

    companion object {
        fun fromServerJson(obj: JSONObject): MemoryEntry {
            val tagList = mutableListOf<String>()
            val arr = obj.optJSONArray("tags")
            if (arr != null) {
                for (i in 0 until arr.length()) {
                    val v = arr.optString(i).trim()
                    if (v.isNotEmpty()) tagList.add(v)
                }
            }
            val now = System.currentTimeMillis()
            return MemoryEntry(
                id = obj.optString("id").ifBlank { UUID.randomUUID().toString() },
                content = obj.optString("content").trim(),
                category = obj.optString("category", "fact"),
                tags = tagList,
                importance = obj.optDouble("importance", 0.6),
                pinned = obj.optBoolean("pinned", false),
                deleted = obj.optBoolean("deleted", false),
                source = obj.optString("source", "pc"),
                createdAtMs = obj.optLong("createdAtMs", now),
                updatedAtMs = obj.optLong("updatedAtMs", now),
                dirty = false
            )
        }
    }
}

data class ChatTurn(
    val id: String = UUID.randomUUID().toString(),
    val role: String, // "user" | "assistant" | "tool"
    val content: String,
    val model: String? = null,
    val elapsedMs: Int? = null,
    val createdAtMs: Long = System.currentTimeMillis()
)

/**
 * Own persistent on-device SQLite + FTS4 memory engine for Foolmoon Mobile.
 * Works 100% offline with hybrid FTS4 + keyword + importance + recency scoring,
 * and delta-syncs seamlessly with the PC Foolmoon gateway when online.
 */
class FoolmoonMemoryStore(context: Context) :
    SQLiteOpenHelper(context, "foolmoon_mobile_memory.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE memory_entries (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'fact',
                tags_json TEXT NOT NULL DEFAULT '[]',
                importance REAL NOT NULL DEFAULT 0.6,
                pinned INTEGER NOT NULL DEFAULT 0,
                deleted INTEGER NOT NULL DEFAULT 0,
                source TEXT NOT NULL DEFAULT 'android',
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL,
                dirty INTEGER NOT NULL DEFAULT 1
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE VIRTUAL TABLE memory_fts USING fts4(
                id,
                content,
                category,
                tags_text
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE chat_turns (
                id TEXT PRIMARY KEY,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                model TEXT,
                elapsed_ms INTEGER,
                created_at_ms INTEGER NOT NULL
            )
            """.trimIndent()
        )
        db.execSQL("CREATE INDEX idx_memory_updated ON memory_entries(updated_at_ms DESC)")
        db.execSQL("CREATE INDEX idx_turns_created ON chat_turns(created_at_ms DESC)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // v1 initial schema
    }

    @Synchronized
    fun remember(
        content: String,
        category: String = "fact",
        tags: List<String> = emptyList(),
        importance: Double = 0.7,
        pinned: Boolean = false,
        source: String = "android"
    ): MemoryEntry {
        val clean = content.trim()
        require(clean.isNotEmpty()) { "Memory content cannot be empty" }
        val now = System.currentTimeMillis()
        val entry = MemoryEntry(
            id = "mem_${UUID.randomUUID().toString().replace("-", "").take(16)}",
            content = clean,
            category = category.trim().ifBlank { "fact" },
            tags = tags.map { it.trim() }.filter { it.isNotEmpty() }.distinct(),
            importance = importance.coerceIn(0.1, 1.0),
            pinned = pinned,
            deleted = false,
            source = source,
            createdAtMs = now,
            updatedAtMs = now,
            dirty = true
        )
        upsertEntry(entry)
        return entry
    }

    @Synchronized
    fun upsertEntry(entry: MemoryEntry) {
        val db = writableDatabase
        val values = ContentValues().apply {
            put("id", entry.id)
            put("content", entry.content)
            put("category", entry.category)
            put("tags_json", JSONArray(entry.tags).toString())
            put("importance", entry.importance)
            put("pinned", if (entry.pinned) 1 else 0)
            put("deleted", if (entry.deleted) 1 else 0)
            put("source", entry.source)
            put("created_at_ms", entry.createdAtMs)
            put("updated_at_ms", entry.updatedAtMs)
            put("dirty", if (entry.dirty) 1 else 0)
        }
        db.beginTransaction()
        try {
            db.insertWithOnConflict("memory_entries", null, values, SQLiteDatabase.CONFLICT_REPLACE)
            db.delete("memory_fts", "id = ?", arrayOf(entry.id))
            if (!entry.deleted && entry.content.isNotBlank()) {
                val fts = ContentValues().apply {
                    put("id", entry.id)
                    put("content", entry.content)
                    put("category", entry.category)
                    put("tags_text", entry.tags.joinToString(" "))
                }
                db.insert("memory_fts", null, fts)
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    @Synchronized
    fun togglePin(id: String) {
        val entry = getById(id) ?: return
        upsertEntry(entry.copy(pinned = !entry.pinned, updatedAtMs = System.currentTimeMillis(), dirty = true))
    }

    @Synchronized
    fun softDelete(id: String) {
        val entry = getById(id) ?: return
        upsertEntry(entry.copy(deleted = true, updatedAtMs = System.currentTimeMillis(), dirty = true))
    }

    @Synchronized
    fun getById(id: String): MemoryEntry? {
        readableDatabase.rawQuery(
            "SELECT id, content, category, tags_json, importance, pinned, deleted, source, created_at_ms, updated_at_ms, dirty FROM memory_entries WHERE id = ?",
            arrayOf(id)
        ).use { c ->
            if (c.moveToFirst()) return cursorToEntry(c)
        }
        return null
    }

    @Synchronized
    fun listActive(limit: Int = 100): List<MemoryEntry> {
        val out = mutableListOf<MemoryEntry>()
        readableDatabase.rawQuery(
            """
            SELECT id, content, category, tags_json, importance, pinned, deleted, source, created_at_ms, updated_at_ms, dirty
            FROM memory_entries
            WHERE deleted = 0
            ORDER BY pinned DESC, updated_at_ms DESC
            LIMIT ?
            """.trimIndent(),
            arrayOf(limit.toString())
        ).use { c ->
            while (c.moveToNext()) out.add(cursorToEntry(c))
        }
        return out
    }

    /**
     * Hybrid offline memory retrieval combining SQLite FTS4 hits, token overlap,
     * pinned boost, importance weight, and exponential recency decay.
     */
    @Synchronized
    fun recall(query: String, limit: Int = 8): List<MemoryEntry> {
        val clean = query.trim()
        val allActive = listActive(250)
        if (clean.isEmpty()) return allActive.take(limit)

        val ftsHitIds = mutableSetOf<String>()
        val ftsTokens = clean.lowercase()
            .replace(Regex("[^\\p{L}\\p{N}\\s]+"), " ")
            .split(Regex("\\s+"))
            .filter { it.length >= 2 }
            .distinct()
            .take(8)

        if (ftsTokens.isNotEmpty()) {
            val matchExpr = ftsTokens.joinToString(" OR ") { "$it*" }
            runCatching {
                readableDatabase.rawQuery(
                    "SELECT id FROM memory_fts WHERE memory_fts MATCH ? LIMIT 40",
                    arrayOf(matchExpr)
                ).use { c ->
                    while (c.moveToNext()) ftsHitIds.add(c.getString(0))
                }
            }
        }

        val now = System.currentTimeMillis()
        return allActive
            .map { entry ->
                val text = "${entry.content} ${entry.category} ${entry.tags.joinToString(" ")}".lowercase()
                val tokenHits = ftsTokens.count { text.contains(it) }
                val ftsBonus = if (entry.id in ftsHitIds) 2.2 else 0.0
                val overlapScore = if (ftsTokens.isNotEmpty()) (tokenHits.toDouble() / ftsTokens.size) * 3.0 else 0.0
                val ageDays = ((now - entry.updatedAtMs).coerceAtLeast(0L)).toDouble() / 86_400_000.0
                val recency = exp(-ageDays / 30.0)
                val pinBoost = if (entry.pinned) 0.9 else 0.0
                val total = ftsBonus + overlapScore + (entry.importance * 0.8) + (recency * 0.4) + pinBoost
                entry to total
            }
            .filter { (entry, score) -> entry.pinned || score > 1.25 }
            .sortedByDescending { it.second }
            .take(limit)
            .map { it.first }
    }

    @Synchronized
    fun pendingDirtyEntries(): List<MemoryEntry> {
        val out = mutableListOf<MemoryEntry>()
        readableDatabase.rawQuery(
            "SELECT id, content, category, tags_json, importance, pinned, deleted, source, created_at_ms, updated_at_ms, dirty FROM memory_entries WHERE dirty = 1",
            null
        ).use { c ->
            while (c.moveToNext()) out.add(cursorToEntry(c))
        }
        return out
    }

    @Synchronized
    fun markSyncedAndMergeServer(serverEntries: List<MemoryEntry>) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.execSQL("UPDATE memory_entries SET dirty = 0 WHERE dirty = 1")
            for (srv in serverEntries) {
                val local = getById(srv.id)
                if (local == null || srv.updatedAtMs >= local.updatedAtMs) {
                    upsertEntry(srv.copy(dirty = false))
                }
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    @Synchronized
    fun saveTurn(turn: ChatTurn) {
        val values = ContentValues().apply {
            put("id", turn.id)
            put("role", turn.role)
            put("content", turn.content)
            put("model", turn.model)
            if (turn.elapsedMs != null) put("elapsed_ms", turn.elapsedMs)
            put("created_at_ms", turn.createdAtMs)
        }
        writableDatabase.insertWithOnConflict("chat_turns", null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    @Synchronized
    fun recentTurns(limit: Int = 40): List<ChatTurn> {
        val out = mutableListOf<ChatTurn>()
        readableDatabase.rawQuery(
            "SELECT id, role, content, model, elapsed_ms, created_at_ms FROM chat_turns ORDER BY created_at_ms DESC LIMIT ?",
            arrayOf(limit.toString())
        ).use { c ->
            while (c.moveToNext()) {
                out.add(
                    ChatTurn(
                        id = c.getString(0),
                        role = c.getString(1),
                        content = c.getString(2),
                        model = if (c.isNull(3)) null else c.getString(3),
                        elapsedMs = if (c.isNull(4)) null else c.getInt(4),
                        createdAtMs = c.getLong(5)
                    )
                )
            }
        }
        return out.reversed()
    }

    @Synchronized
    fun clearChatHistory() {
        writableDatabase.delete("chat_turns", null, null)
    }

    private fun cursorToEntry(c: android.database.Cursor): MemoryEntry {
        val tagsJson = c.getString(3) ?: "[]"
        val tags = mutableListOf<String>()
        runCatching {
            val arr = JSONArray(tagsJson)
            for (i in 0 until arr.length()) {
                val t = arr.optString(i)
                if (t.isNotBlank()) tags.add(t)
            }
        }
        return MemoryEntry(
            id = c.getString(0),
            content = c.getString(1),
            category = c.getString(2),
            tags = tags,
            importance = c.getDouble(4),
            pinned = c.getInt(5) == 1,
            deleted = c.getInt(6) == 1,
            source = c.getString(7),
            createdAtMs = c.getLong(8),
            updatedAtMs = c.getLong(9),
            dirty = c.getInt(10) == 1
        )
    }
}
