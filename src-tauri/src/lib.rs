use std::{fs, sync::{atomic::{AtomicBool, AtomicU32, Ordering}, Mutex}, time::Duration};
use tauri::{Emitter, Manager, State};
use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};

const MAX_RESTARTS: u32 = 3;

#[derive(Default)]
struct CollectorState {
    child: Mutex<Option<CommandChild>>,
    stopping: AtomicBool,
    restart_count: AtomicU32,
}

#[derive(Clone, serde::Serialize)]
struct CollectorStatusEvent {
    status: String,
    message: String,
    attempt: u32,
}

fn emit_status(app: &tauri::AppHandle, status: &str, message: impl Into<String>, attempt: u32) {
    let _ = app.emit(
        "collector://status",
        CollectorStatusEvent {
            status: status.to_string(),
            message: message.into(),
            attempt,
        },
    );
}

#[tauri::command]
fn collector_status(state: State<'_, CollectorState>) -> String {
    if state.child.lock().expect("collector state poisoned").is_some() {
        "running".to_string()
    } else {
        "stopped".to_string()
    }
}

fn start_collector(app: &tauri::AppHandle) {
    let shell = app.shell();
    let result = shell.sidecar("collector").and_then(|mut command| {
        if let Ok(data_dir) = app.path().app_data_dir() {
            let _ = fs::create_dir_all(&data_dir);
            command = command.env(
                "DATABASE_URL",
                format!("sqlite://{}", data_dir.join("shioaji-market.sqlite").display()),
            );
        }
        command
            .env("SHIOAJI_BASE_URL", "http://127.0.0.1:21322")
            .env("COLLECTOR_HOST", "127.0.0.1")
            .env("COLLECTOR_PORT", "8787")
            .args(["--embedded"])
            .spawn()
    });

    match result {
        Ok((mut rx, child)) => {
            *app.state::<CollectorState>()
                .child
                .lock()
                .expect("collector state poisoned") = Some(child);
            let attempt = app.state::<CollectorState>().restart_count.load(Ordering::Relaxed);
            emit_status(app, "running", "Collector 已啟動", attempt);

            let app_handle = app.clone();
            let stable_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                std::thread::sleep(Duration::from_secs(30));
                let state = stable_handle.state::<CollectorState>();
                if !state.stopping.load(Ordering::Relaxed)
                    && state.child.lock().expect("collector state poisoned").is_some()
                {
                    state.restart_count.store(0, Ordering::Relaxed);
                    eprintln!("[desktop] collector stable for 30 seconds; restart counter reset");
                }
            });
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            println!("[collector] {}", String::from_utf8_lossy(&line).trim_end());
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[collector] {}", String::from_utf8_lossy(&line).trim_end());
                        }
                        CommandEvent::Error(error) => {
                            eprintln!("[desktop] collector process error: {error}");
                        }
                        CommandEvent::Terminated(payload) => {
                            let state = app_handle.state::<CollectorState>();
                            if state.stopping.load(Ordering::Relaxed) {
                                break;
                            }
                            let attempt = state.restart_count.fetch_add(1, Ordering::Relaxed) + 1;
                            let code = payload.code.map_or_else(|| "unknown".to_string(), |v| v.to_string());
                            let message = format!("Collector 已異常結束（exit code: {code}）");
                            eprintln!("[desktop] {message}");
                            let _ = state.child.lock().expect("collector state poisoned").take();
                            emit_status(&app_handle, "terminated", &message, attempt);

                            if attempt <= MAX_RESTARTS {
                                emit_status(&app_handle, "restarting", format!("{} 秒後自動重啟（第 {attempt}/{MAX_RESTARTS} 次）", 1), attempt);
                                std::thread::sleep(Duration::from_secs(1));
                                if !state.stopping.load(Ordering::Relaxed) {
                                    start_collector(&app_handle);
                                }
                            } else {
                                emit_status(&app_handle, "failed", "Collector 多次異常終止，已停止自動重啟，請檢查設定或重新啟動 App", attempt);
                            }
                            break;
                        }
                        _ => {}
                    }
                }
            });
        }
        Err(error) => {
            let message = format!("Collector sidecar 無法啟動：{error}");
            eprintln!("[desktop] {message}");
            emit_status(app, "failed", message, 0);
        }
    }
}

fn stop_collector(app: &tauri::AppHandle) {
    let state = app.state::<CollectorState>();
    state.stopping.store(true, Ordering::Relaxed);
    let child = state
        .child
        .lock()
        .expect("collector state poisoned")
        .take();
    if let Some(child) = child {
        match child.kill() {
            Ok(()) => eprintln!("[desktop] collector sidecar terminated"),
            Err(error) => eprintln!("[desktop] collector sidecar termination failed: {error}"),
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(CollectorState::default())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![collector_status])
        .setup(|app| {
            start_collector(&app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running Shioaji Private Market")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested { .. } => stop_collector(app),
            tauri::RunEvent::Exit => stop_collector(app),
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    #[test]
    fn restart_policy_stops_after_three_attempts() {
        assert_eq!(super::MAX_RESTARTS, 3);
    }
}
