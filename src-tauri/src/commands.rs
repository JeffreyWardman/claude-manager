use crate::DbState;
use crate::sessions::{get_all_sessions, ClaudeSession};
use std::collections::HashMap;
use tauri::State;

#[tauri::command]
pub fn get_sessions() -> Vec<ClaudeSession> {
    get_all_sessions()
}

/// Fetch all display names from Postgres. Returns empty map if DB unavailable.
#[tauri::command]
pub async fn get_display_names(
    db: State<'_, DbState>,
) -> Result<HashMap<String, String>, String> {
    let Some(pool) = db.0.as_ref() else {
        return Ok(HashMap::new());
    };
    let rows: Vec<(String, String)> =
        sqlx::query_as("SELECT session_id, display_name FROM sessions")
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().collect())
}

/// Upsert a display name. No-op if DB unavailable.
#[tauri::command]
pub async fn set_display_name(
    session_id: String,
    display_name: String,
    db: State<'_, DbState>,
) -> Result<(), String> {
    let Some(pool) = db.0.as_ref() else {
        return Ok(());
    };
    sqlx::query(
        "INSERT INTO sessions (session_id, display_name)
         VALUES ($1, $2)
         ON CONFLICT (session_id) DO UPDATE
         SET display_name = $2, updated_at = NOW()",
    )
    .bind(&session_id)
    .bind(&display_name)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}
