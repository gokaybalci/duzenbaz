//! Düzenbaz desktop shell.
//!
//! All school data stays on this computer: the UI is bundled into the binary, the
//! content security policy forbids any network access, and the page can only touch
//! the disk through the commands below, each of which goes through a native file
//! dialog the user confirms (except re-saving to the file the user already chose).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

/// The project file the user opened or saved last, so Ctrl+S can save in place.
#[derive(Default)]
struct CurrentFile(Mutex<Option<PathBuf>>);

#[derive(Serialize)]
struct OpenedFile {
    name: String,
    data: Vec<u8>,
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

fn read_project(path: PathBuf, cur: &CurrentFile) -> Result<OpenedFile, String> {
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    // A Dagitmatik import must be saved as a new Düzenbaz file, never over the .dprg.
    *cur.0.lock().unwrap() = if has_ext(&path, &["dprg"]) { None } else { Some(path.clone()) };
    Ok(OpenedFile { name: file_name(&path), data })
}

/// Write via a temporary file so a crash or power cut can't leave a half-written file.
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

/// Where dialogs start: the Documents folder, or the home folder if there is none.
fn documents_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    let p = app.path();
    p.document_dir().ok().filter(|d| d.is_dir()).or_else(|| p.home_dir().ok().filter(|d| d.is_dir()))
}

#[tauri::command]
async fn open_project(app: tauri::AppHandle, cur: State<'_, CurrentFile>) -> Result<Option<OpenedFile>, String> {
    let mut dlg = app.dialog().file().add_filter("Düzenbaz / Dağıtmatik", &PROJECT_EXTS);
    if let Some(d) = documents_dir(&app) {
        dlg = dlg.set_directory(d);
    }
    match dlg.blocking_pick_file() {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            read_project(path, &cur).map(Some)
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
    let existing = if save_as { None } else { cur.0.lock().unwrap().clone() };
    let path = match existing {
        Some(p) => p,
        None => {
            let mut dlg = app.dialog().file().add_filter("Düzenbaz", &["duzenbaz"]).set_file_name(&suggested);
            if let Some(d) = documents_dir(&app) {
                dlg = dlg.set_directory(d);
            }
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
        }
    };
    write_atomic(&path, json.as_bytes())?;
    let name = file_name(&path);
    *cur.0.lock().unwrap() = Some(path);
    Ok(Some(name))
}

#[tauri::command]
fn forget_project_path(cur: State<'_, CurrentFile>) {
    *cur.0.lock().unwrap() = None;
}

/// Save an export (HTML / CSV) wherever the user picks.
#[tauri::command]
async fn save_export(app: tauri::AppHandle, name: String, data: Vec<u8>, ext: String) -> Result<Option<String>, String> {
    let ext = match ext.as_str() {
        "html" | "csv" | "pdf" => ext,
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

/// Real number of CPU cores (web engines may under-report it for privacy).
#[tauri::command]
fn cpu_count() -> usize {
    std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2)
}

/// A project file passed on the command line (double-clicking a .duzenbaz file).
#[tauri::command]
fn startup_file(cur: State<'_, CurrentFile>) -> Option<OpenedFile> {
    let path = std::env::args_os().skip(1).map(PathBuf::from).find(|p| has_ext(p, &PROJECT_EXTS) && p.is_file())?;
    read_project(path, &cur).ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(CurrentFile::default())
        .invoke_handler(tauri::generate_handler![open_project, save_project, forget_project_path, save_export, startup_file, cpu_count])
        .run(tauri::generate_context!())
        .expect("error while running Düzenbaz");
}
