
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct CurrentFile(Mutex<Option<PathBuf>>);

#[derive(Serialize)]
struct OpenedFile {
    name: String,
    data: Vec<u8>,
    path: Option<String>,
}

const PROJECT_EXTS: [&str; 3] = ["duzenbaz", "json", "dprg"];

fn file_name(p: &Path) -> String {
    p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

fn has_ext(p: &Path, exts: &[&str]) -> bool {
    p.extension()
        .map(|e| exts.iter().any(|x| e.eq_ignore_ascii_case(x)))
        .unwrap_or(false)
}

fn setting_file(app: &tauri::AppHandle, name: &str) -> Option<PathBuf> {
    use tauri::Manager;
    app.path().app_config_dir().ok().map(|d| d.join(name))
}

fn read_setting(app: &tauri::AppHandle, name: &str) -> Option<String> {
    let v = fs::read_to_string(setting_file(app, name)?).ok()?;
    let v = v.trim().to_string();
    (!v.is_empty()).then_some(v)
}

fn write_setting(app: &tauri::AppHandle, name: &str, value: Option<&Path>) {
    if let Some(f) = setting_file(app, name) {
        match value {
            Some(v) => {
                if let Some(dir) = f.parent() {
                    let _ = fs::create_dir_all(dir);
                }
                let _ = write_atomic(&f, v.to_string_lossy().as_bytes());
            }
            None => {
                let _ = fs::remove_file(f);
            }
        }
    }
}

fn set_current(app: &tauri::AppHandle, cur: &CurrentFile, path: Option<PathBuf>) {
    write_setting(app, "current-file", path.as_deref());
    *cur.0.lock().unwrap() = path;
}

fn save_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    read_setting(app, "save-dir")
        .map(PathBuf::from)
        .filter(|d| d.is_dir())
        .or_else(|| documents_dir(app).map(|d| d.join("Düzenbaz")))
}

fn free_name(dir: &Path, suggested: &str) -> PathBuf {
    let first = dir.join(suggested);
    if !first.exists() {
        return first;
    }
    let stem = Path::new(suggested).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    (2..)
        .map(|n| dir.join(format!("{stem} ({n}).duzenbaz")))
        .find(|p| !p.exists())
        .unwrap()
}

fn read_project(app: &tauri::AppHandle, path: PathBuf, cur: &CurrentFile) -> Result<OpenedFile, String> {
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    let name = file_name(&path);
    let path = has_ext(&path, &["duzenbaz"]).then_some(path);
    set_current(app, cur, path.clone());
    Ok(OpenedFile { name, data, path: path.map(|p| p.to_string_lossy().into_owned()) })
}

fn write_atomic(path: &Path, data: &[u8]) -> Result<(), String> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

fn documents_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    let p = app.path();
    p.document_dir().ok().filter(|d| d.is_dir()).or_else(|| p.home_dir().ok().filter(|d| d.is_dir()))
}

#[tauri::command]
async fn open_project(app: tauri::AppHandle, cur: State<'_, CurrentFile>) -> Result<Option<OpenedFile>, String> {
    let mut dlg = app.dialog().file().add_filter("Düzenbaz", &PROJECT_EXTS);
    if let Some(d) = save_dir(&app).filter(|d| d.is_dir()).or_else(|| documents_dir(&app)) {
        dlg = dlg.set_directory(d);
    }
    match dlg.blocking_pick_file() {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            read_project(&app, path, &cur).map(Some)
        }
        None => Ok(None),
    }
}

#[tauri::command]
async fn save_project(
    app: tauri::AppHandle,
    cur: State<'_, CurrentFile>,
    json: String,
    save_as: bool,
    suggested: String,
) -> Result<Option<String>, String> {
    let existing = if save_as { None } else { cur.0.lock().unwrap().clone().filter(|p| p.parent().is_some_and(|d| d.is_dir())) };
    let path = match existing {
        Some(p) => p,
        None => {
            let dir = save_dir(&app).ok_or("no folder to save in")?;
            fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            if save_as {
                let dlg = app.dialog().file().add_filter("Düzenbaz", &["duzenbaz"]).set_file_name(&suggested).set_directory(&dir);
                match dlg.blocking_save_file() {
                    Some(fp) => {
                        let mut p = fp.into_path().map_err(|e| e.to_string())?;
                        if p.extension().is_none() {
                            p.set_extension("duzenbaz");
                        }
                        p
                    }
                    None => return Ok(None),
                }
            } else {
                free_name(&dir, &suggested)
            }
        }
    };
    write_atomic(&path, json.as_bytes())?;
    let full = path.to_string_lossy().into_owned();
    set_current(&app, &cur, Some(path));
    Ok(Some(full))
}

#[tauri::command]
fn forget_project_path(app: tauri::AppHandle, cur: State<'_, CurrentFile>) {
    set_current(&app, &cur, None);
}

// The webview only confirms the path we recorded ourselves: it can never point Save at a new file.
#[tauri::command]
fn restore_project_path(app: tauri::AppHandle, cur: State<'_, CurrentFile>, path: Option<String>) {
    let last = read_setting(&app, "current-file").map(PathBuf::from).filter(|p| p.is_file());
    let same = last.filter(|p| path.as_deref() == Some(&*p.to_string_lossy()));
    set_current(&app, &cur, same);
}

#[tauri::command]
fn get_save_dir(app: tauri::AppHandle) -> Option<String> {
    save_dir(&app).map(|d| d.to_string_lossy().into_owned())
}

#[tauri::command]
async fn choose_save_dir(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let mut dlg = app.dialog().file();
    if let Some(d) = save_dir(&app).filter(|d| d.is_dir()).or_else(|| documents_dir(&app)) {
        dlg = dlg.set_directory(d);
    }
    match dlg.blocking_pick_folder() {
        Some(fp) => {
            let dir = fp.into_path().map_err(|e| e.to_string())?;
            write_setting(&app, "save-dir", Some(&dir));
            Ok(Some(dir.to_string_lossy().into_owned()))
        }
        None => Ok(None),
    }
}

#[tauri::command]
async fn save_export(app: tauri::AppHandle, name: String, data: Vec<u8>, ext: String) -> Result<Option<String>, String> {
    let ext = match ext.as_str() {
        "html" | "csv" | "xlsx" | "zip" => ext,
        _ => return Err("unsupported file type".into()),
    };
    let mut dlg = app.dialog().file().add_filter(ext.to_uppercase(), &[ext.as_str()]).set_file_name(&name);
    if let Some(d) = documents_dir(&app) {
        dlg = dlg.set_directory(d);
    }
    match dlg.blocking_save_file() {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            write_atomic(&path, &data)?;
            Ok(Some(file_name(&path)))
        }
        None => Ok(None),
    }
}

// Fixed URL so the webview cannot ask us to open anything else.
#[tauri::command]
fn open_repo() -> Result<(), String> {
    const URL: &str = "https://github.com/gokaybalci/duzenbaz";
    #[cfg(target_os = "windows")]
    let mut cmd = {
        use std::os::windows::process::CommandExt;
        let mut c = std::process::Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", URL]).creation_flags(0x0800_0000);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(URL);
        c
    };
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(URL);
        c
    };
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn cpu_count() -> usize {
    std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2)
}

#[tauri::command]
fn startup_file(app: tauri::AppHandle, cur: State<'_, CurrentFile>) -> Option<OpenedFile> {
    let path = std::env::args_os().skip(1).map(PathBuf::from).find(|p| has_ext(p, &PROJECT_EXTS) && p.is_file())?;
    read_project(&app, path, &cur).ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(CurrentFile::default())
        .invoke_handler(tauri::generate_handler![open_project, save_project, forget_project_path, restore_project_path, get_save_dir, choose_save_dir, save_export, startup_file, cpu_count, open_repo])
        .run(tauri::generate_context!())
        .expect("error while running Düzenbaz");
}
