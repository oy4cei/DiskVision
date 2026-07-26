use serde_json::json;
use std::process::Command;
use sysinfo::Disks;

#[tauri::command]
fn get_disk_space(_path: String) -> serde_json::Value {
    let disks = Disks::new_with_refreshed_list();
    
    let mut total = 0;
    let mut available = 0;
    
    for disk in disks.list() {
        let mount_point = disk.mount_point().to_str().unwrap_or("");
        if mount_point == "/" || mount_point == "/System/Volumes/Data" {
            total = disk.total_space();
            available = disk.available_space();
            if mount_point == "/System/Volumes/Data" {
                break;
            }
        }
    }
    
    if total == 0 {
        total = 500_000_000_000;
        available = 250_000_000_000;
    }

    let used = total.saturating_sub(available);

    json!({
        "total": total,
        "used": used,
        "free": available
    })
}

#[tauri::command]
fn open_in_finder(path: String) -> Result<(), String> {
    Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_full_disk_access_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
            .spawn();
    }
    Ok(())
}

#[tauri::command]
fn check_full_disk_access() -> bool {
    #[cfg(target_os = "macos")]
    {
        fs::read_dir("/Library/Application Support/com.apple.TCC").is_ok()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::mpsc;
use std::collections::{HashSet, HashMap};
use rayon::prelude::*;
use tauri::Emitter;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    id: String,
    name: String,
    kind: String,
    size: u64,
    files_count: u64,
    folders_count: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<FileNode>>,
    category_sizes: HashMap<String, u64>,
    category_files_count: HashMap<String, u64>,
}

pub struct AppState {
    pub scan_result: std::sync::Mutex<Option<FileNode>>,
}

fn clone_to_depth(node: &FileNode, current_depth: u32, max_depth: u32) -> FileNode {
    let children = if current_depth < max_depth {
        node.children.as_ref().map(|children_vec| {
            children_vec
                .iter()
                .map(|child| clone_to_depth(child, current_depth + 1, max_depth))
                .collect()
        })
    } else {
        None
    };

    FileNode {
        id: node.id.clone(),
        name: node.name.clone(),
        kind: node.kind.clone(),
        size: node.size,
        files_count: node.files_count,
        folders_count: node.folders_count,
        children,
        category_sizes: node.category_sizes.clone(),
        category_files_count: node.category_files_count.clone(),
    }
}

fn find_node<'a>(node: &'a FileNode, target_id: &str) -> Option<&'a FileNode> {
    if node.id == target_id {
        return Some(node);
    }
    if let Some(children) = &node.children {
        for child in children {
            if let Some(found) = find_node(child, target_id) {
                return Some(found);
            }
        }
    }
    None
}

fn get_file_category(name: &str, path: &str) -> String {
    let lower_path = path.to_lowercase();
    if lower_path.contains("/library/developer/")
        || lower_path.contains("/deriveddata/")
        || lower_path.contains("/node_modules/")
        || lower_path.contains("/.git/")
        || lower_path.contains("/.npm/")
        || lower_path.contains("/.cargo/")
        || lower_path.contains("/.pnpm/")
        || lower_path.contains("/.vscode/")
        || lower_path.contains("/modulecache/")
    {
        return "developer".to_string();
    }
    if lower_path.contains("/library/caches/")
        || lower_path.contains("/library/logs/")
        || lower_path.contains("/library/containers/")
        || lower_path.contains("/library/group containers/")
        || lower_path.contains("/library/preferences/")
        || lower_path.contains("/var/db/")
        || lower_path.contains("/private/var/")
        || lower_path.contains("/diagnostics/")
        || lower_path.contains("/uuidtext/")
    {
        return "system".to_string();
    }

    let ext = name.split('.').last().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" | "jpe" | "png" | "gif" | "webp" | "svg" | "svgz" | "ico" | "tiff" | "tif" | "heic" | "heif" 
        | "raw" | "cr2" | "cr3" | "nef" | "arw" | "dng" | "orf" | "rw2" | "psd" | "psb" | "ai" | "eps" | "xcf" | "sketch" | "fig" => "photos".to_string(),
        
        "mp4" | "mkv" | "avi" | "mov" | "qt" | "wmv" | "flv" | "webm" | "m4v" | "mpg" | "mpeg" | "m2v" | "mts" 
        | "m2ts" | "3gp" | "3g2" | "vob" | "ogv" | "divx" | "asf" | "prproj" | "aep" => "video".to_string(),
        
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "oga" | "wma" | "m4a" | "aiff" | "aif" | "alac" | "opus" | "mid" | "midi" 
        | "mka" | "ape" | "mpc" | "caf" => "music".to_string(),
        
        "pdf" | "doc" | "docx" | "docm" | "dot" | "dotx" | "xls" | "xlsx" | "xlsm" | "xlt" | "xltx" | "ppt" | "pptx" 
        | "pptm" | "pot" | "potx" | "txt" | "rtf" | "csv" | "tsv" | "pages" | "numbers" | "keynote" | "epub" | "mobi" 
        | "azw" | "azw3" | "odt" | "ods" | "odp" | "odg" | "odf" | "rtx" | "tex" => "documents".to_string(),
        
        "app" | "dmg" | "pkg" | "exe" | "msi" | "ipa" | "apk" | "deb" | "rpm" | "appimage" | "jar" | "run" => "apps".to_string(),
        
        "zip" | "rar" | "tar" | "gz" | "gzip" | "7z" | "bz2" | "bzip2" | "xz" | "tgz" | "iso" | "img" | "cab" | "wim" 
        | "z" | "sit" | "sitx" | "vdi" | "vmdk" | "qcow2" | "ova" | "vhd" | "vhdx" | "pvm" | "hdd" => "archives".to_string(),
        
        "js" | "jsx" | "ts" | "tsx" | "html" | "htm" | "xhtml" | "css" | "sass" | "scss" | "less" | "py" | "pyc" | "pyd" 
        | "pyo" | "go" | "rs" | "cpp" | "cc" | "cxx" | "c" | "h" | "hpp" | "java" | "class" | "cs" | "sh" | "bash" | "zsh" 
        | "php" | "rb" | "swift" | "kt" | "kts" | "scala" | "pl" | "pm" | "lua" | "sql" | "ddl" | "sqlitedb" | "json" 
        | "xml" | "yaml" | "yml" | "md" | "markdown" | "toml" | "gradle" | "pom" | "lock" | "dockerfile" | "vagrantfile" 
        | "makefile" | "map" | "a" | "o" | "la" | "lo" | "pcm" | "mdb" => "developer".to_string(),
        
        "sys" | "dll" | "dylib" | "so" | "kext" | "bin" | "dat" | "log" | "plist" | "cache" | "db" | "sqlite" 
        | "sqlite3" | "localstorage" | "tmp" | "temp" | "bak" | "old" | "localized" | "ds_store" | "telemetry" 
        | "crash" | "diag" | "config" | "conf" | "properties" | "backup" | "tracev3" | "dsc" | "uuidtext" => "system".to_string(),
        
        _ => "other".to_string()
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgress {
    files_count: u64,
    folders_count: u64,
    total_size: u64,
    current_path: String,
}

/// Paths to completely skip when scanning from root "/".
/// These cause double-counting (firmlinks) or are virtual/useless.
fn build_skip_set(scan_root: &str) -> HashSet<String> {
    let mut skip = HashSet::new();
    
    // Only apply broad exclusions when scanning from root
    if scan_root == "/" {
        // ── Firmlink duplicates ──
        // /System/Volumes/Data mirrors user data already visible at /
        // via firmlinks (/Users, /Library, /Applications, etc.)
        skip.insert("/System/Volumes/Data".to_string());
        
        // ── Other APFS volume mount points ──
        skip.insert("/System/Volumes/Preboot".to_string());
        skip.insert("/System/Volumes/Recovery".to_string());
        skip.insert("/System/Volumes/Update".to_string());
        skip.insert("/System/Volumes/VM".to_string());
        skip.insert("/System/Volumes/xarts".to_string());
        skip.insert("/System/Volumes/iSCPreboot".to_string());
        skip.insert("/System/Volumes/Hardware".to_string());
        
        // ── Virtual filesystems ──
        skip.insert("/dev".to_string());
        skip.insert("/.vol".to_string());
        
        // ── /Volumes can contain recursive mounts of the boot disk ──
        // We'll handle /Volumes specially: skip entries that point
        // back to the root filesystem
        skip.insert("/Volumes/Macintosh HD".to_string());
        skip.insert("/Volumes/Macintosh HD - Data".to_string());
        
        // ── Swap / VM files ──
        skip.insert("/private/var/vm".to_string());
        
        // ── Time Machine local snapshots & system caches ──
        skip.insert("/.MobileBackups".to_string());
        skip.insert("/.MobileBackups.trash".to_string());
        skip.insert("/.Spotlight-V100".to_string());
        skip.insert("/.fseventsd".to_string());
    }

    // ── TCC-sensitive system database directories (prevent macOS popup spam) ──
    if let Ok(home) = std::env::var("HOME") {
        skip.insert(format!("{}/Library/Mail", home));
        skip.insert(format!("{}/Library/Messages", home));
        skip.insert(format!("{}/Library/Calendars", home));
        skip.insert(format!("{}/Library/Reminders", home));
        skip.insert(format!("{}/Library/Safari", home));
        skip.insert(format!("{}/Library/Application Support/AddressBook", home));
        skip.insert(format!("{}/Library/IdentityServices", home));
        skip.insert(format!("{}/Library/PersonalizationPortrait", home));
        skip.insert(format!("{}/Library/Suggestions", home));
    }
    
    skip
}

#[tauri::command]
async fn scan_directory(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<FileNode, String> {
    let (tx, rx) = mpsc::channel::<(u64, u64, u64, String)>();
    
    // Spawn an async task to listen for progress and emit to frontend
    tauri::async_runtime::spawn(async move {
        let mut stats = ScanProgress {
            files_count: 0,
            folders_count: 0,
            total_size: 0,
            current_path: String::new(),
        };
        
        let mut batch_count = 0u64;
        
        while let Ok((f_count, d_count, size, cur_path)) = rx.recv() {
            stats.files_count += f_count;
            stats.folders_count += d_count;
            stats.total_size += size;
            
            if !cur_path.is_empty() {
                stats.current_path = cur_path;
            }
            
            batch_count += 1;
            if batch_count % 200 == 0 {
                let _ = app.emit("scan-progress", &stats);
            }
        }
        
        // emit final stats
        let _ = app.emit("scan-progress", &stats);
    });

    let scan_root = path.clone();
    
    let root_node = tauri::async_runtime::spawn_blocking(move || {
        let skip_set = build_skip_set(&scan_root);
        
        #[cfg(unix)]
        use std::os::unix::fs::MetadataExt;
        
        // Get the device ID of the scan root to detect cross-device mounts
        #[cfg(unix)]
        let root_dev = fs::metadata(&scan_root).map(|m| m.dev()).unwrap_or(0);
        
        fn scan_recursive(
            dir_path: &std::path::Path,
            tx: &mpsc::Sender<(u64, u64, u64, String)>,
            skip_set: &HashSet<String>,
            #[cfg(unix)] root_dev: u64,
        ) -> std::io::Result<FileNode> {
            let name = dir_path.file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| {
                    // For root "/" the file_name is None
                    dir_path.to_string_lossy().into_owned()
                });
            
            let mut node = FileNode {
                id: dir_path.to_string_lossy().into_owned(),
                name,
                kind: "directory".to_string(),
                size: 0,
                files_count: 0,
                folders_count: 0,
                children: Some(Vec::new()),
                category_sizes: HashMap::new(),
                category_files_count: HashMap::new(),
            };

            let entries = match fs::read_dir(dir_path) {
                Ok(e) => e,
                Err(_) => {
                    // Permission denied or other error — return empty dir
                    let _ = tx.send((0, 1, 0, node.name.clone()));
                    return Ok(node);
                }
            };
            
            let valid_entries: Vec<_> = entries.flatten().collect();

            let children: Vec<FileNode> = valid_entries.into_par_iter().filter_map(|entry| {
                let path = entry.path();
                let path_str = path.to_string_lossy().to_string();
                let entry_name = entry.file_name().to_string_lossy().into_owned();
                
                // Check skip list
                if skip_set.contains(&path_str) {
                    return None;
                }
                
                let file_type = match entry.file_type() {
                    Ok(ft) => ft,
                    Err(_) => return None,
                };

                if file_type.is_symlink() {
                    return None;
                }

                let metadata = match entry.metadata() {
                    Ok(m) => m,
                    Err(_) => return None, // can't read metadata, skip
                };
                
                if metadata.is_dir() {
                    // On unix, skip directories on different devices (cross-mount)
                    // This prevents traversing into other mounted volumes
                    #[cfg(unix)]
                    {
                        if metadata.dev() != root_dev {
                            return None;
                        }
                    }
                    
                    match scan_recursive(
                        &path, tx, skip_set,
                        #[cfg(unix)] root_dev,
                    ) {
                        Ok(sub_node) => Some(sub_node),
                        Err(_) => None,
                    }
                } else {
                    let logical_size = metadata.len();
                    #[cfg(unix)]
                    let physical_size = metadata.blocks() * 512;
                    #[cfg(not(unix))]
                    let physical_size = logical_size;

                    let size = if logical_size > physical_size * 2 && logical_size - physical_size > 10 * 1024 * 1024 {
                        physical_size
                    } else {
                        logical_size
                    };
                    
                    let cat = get_file_category(&entry_name, &path_str);
                    let mut category_sizes = HashMap::new();
                    category_sizes.insert(cat.clone(), size);
                    let mut category_files_count = HashMap::new();
                    category_files_count.insert(cat, 1);

                    let _ = tx.send((1, 0, size, String::new()));
                    Some(FileNode {
                        id: path_str,
                        name: entry_name,
                        kind: "file".to_string(),
                        size,
                        files_count: 1,
                        folders_count: 0,
                        children: None,
                        category_sizes,
                        category_files_count,
                    })
                }
            }).collect();

            let mut category_sizes = HashMap::new();
            let mut category_files_count = HashMap::new();

            for child in children {
                node.size += child.size;
                node.files_count += child.files_count;
                if child.kind == "directory" {
                    node.folders_count += 1 + child.folders_count;
                }

                for (cat, sz) in &child.category_sizes {
                    *category_sizes.entry(cat.clone()).or_insert(0) += sz;
                }
                for (cat, count) in &child.category_files_count {
                    *category_files_count.entry(cat.clone()).or_insert(0) += count;
                }

                node.children.as_mut().unwrap().push(child);
            }
            node.category_sizes = category_sizes;
            node.category_files_count = category_files_count;

            if let Some(children) = node.children.as_mut() {
                children.sort_by(|a, b| b.size.cmp(&a.size));
            }

            let _ = tx.send((0, 1, 0, node.name.clone()));
            
            Ok(node)
        }

        let path_obj = std::path::Path::new(&path);
        scan_recursive(
            path_obj, &tx, &skip_set,
            #[cfg(unix)] root_dev,
        ).map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())??;

    // Save full result in state
    {
        let mut guard = state.scan_result.lock().map_err(|e| e.to_string())?;
        *guard = Some(root_node.clone());
    }

    // Return root node up to depth 2 to JS
    Ok(clone_to_depth(&root_node, 0, 2))
}

#[tauri::command]
fn get_directory_node(
    state: tauri::State<'_, AppState>,
    path: String,
    depth: u32,
) -> Result<FileNode, String> {
    let guard = state.scan_result.lock().map_err(|e| e.to_string())?;
    let root = guard.as_ref().ok_or_else(|| "No scan data available".to_string())?;
    
    let found = find_node(root, &path)
        .ok_or_else(|| format!("Directory not found: {}", path))?;
    
    Ok(clone_to_depth(found, 0, depth))
}

fn delete_node_recursive(node: &mut FileNode, target_id: &str) -> Option<u64> {
    if node.id == target_id {
        return Some(node.size);
    }
    
    if let Some(children) = &mut node.children {
        let mut remove_idx = None;
        let mut deleted_size = None;
        
        for (i, child) in children.iter_mut().enumerate() {
            if child.id == target_id {
                remove_idx = Some(i);
                deleted_size = Some(child.size);
                break;
            } else if let Some(sz) = delete_node_recursive(child, target_id) {
                deleted_size = Some(sz);
                break;
            }
        }
        
        if let Some(sz) = deleted_size {
            if let Some(idx) = remove_idx {
                children.remove(idx);
            }
            
            let mut new_size = 0;
            let mut new_files = 0;
            let mut new_folders = 0;
            let mut category_sizes = HashMap::new();
            let mut category_files_count = HashMap::new();
            
            for child in children {
                new_size += child.size;
                new_files += child.files_count;
                if child.kind == "directory" {
                    new_folders += 1 + child.folders_count;
                }
                for (cat, s) in &child.category_sizes {
                    *category_sizes.entry(cat.clone()).or_insert(0) += s;
                }
                for (cat, count) in &child.category_files_count {
                    *category_files_count.entry(cat.clone()).or_insert(0) += count;
                }
            }
            
            node.size = new_size;
            node.files_count = new_files;
            node.folders_count = new_folders;
            node.category_sizes = category_sizes;
            node.category_files_count = category_files_count;
            
            return Some(sz);
        }
    }
    
    None
}

#[tauri::command]
fn delete_node(state: tauri::State<'_, AppState>, path: String) -> Result<FileNode, String> {
    let mut guard = state.scan_result.lock().map_err(|e| e.to_string())?;
    let root = guard.as_mut().ok_or_else(|| "No scan data available".to_string())?;
    
    delete_node_recursive(root, &path)
        .ok_or_else(|| format!("Node not found: {}", path))?;
    
    Ok(clone_to_depth(root, 0, 2))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(AppState {
        scan_result: std::sync::Mutex::new(None),
    })
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
        get_disk_space,
        open_in_finder,
        scan_directory,
        get_directory_node,
        delete_node,
        open_full_disk_access_settings,
        check_full_disk_access
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      use tauri::Manager;
      if let Some(icon) = app.default_window_icon() {
        if let Some(window) = app.get_webview_window("main") {
          let _ = window.set_icon(icon.clone());
        }
      }

      #[cfg(target_os = "macos")]
      {
        unsafe {
          use std::ffi::CString;
          use std::os::raw::c_void;

          type Id = *mut c_void;
          type Sel = *mut c_void;

          extern "C" {
              fn objc_getClass(name: *const i8) -> Id;
              fn sel_registerName(name: *const i8) -> Sel;
              fn objc_msgSend();
          }

          let ns_application_cls = objc_getClass(CString::new("NSApplication").unwrap().as_ptr());
          let shared_app_sel = sel_registerName(CString::new("sharedApplication").unwrap().as_ptr());
          let msg_send_get_app: unsafe extern "C" fn(Id, Sel) -> Id = std::mem::transmute(objc_msgSend as *const ());
          let shared_app: Id = msg_send_get_app(ns_application_cls, shared_app_sel);

          let ns_image_cls = objc_getClass(CString::new("NSImage").unwrap().as_ptr());
          let alloc_sel = sel_registerName(CString::new("alloc").unwrap().as_ptr());
          let init_with_data_sel = sel_registerName(CString::new("initWithData:").unwrap().as_ptr());
          let set_icon_sel = sel_registerName(CString::new("setApplicationIconImage:").unwrap().as_ptr());

          let icon_bytes = include_bytes!("../icons/icon.png");
          let ns_data_cls = objc_getClass(CString::new("NSData").unwrap().as_ptr());
          let data_with_bytes_sel = sel_registerName(CString::new("dataWithBytes:length:").unwrap().as_ptr());
          
          let msg_send_data: unsafe extern "C" fn(Id, Sel, *const c_void, usize) -> Id = std::mem::transmute(objc_msgSend as *const ());
          let data: Id = msg_send_data(
              ns_data_cls,
              data_with_bytes_sel,
              icon_bytes.as_ptr() as *const c_void,
              icon_bytes.len()
          );

          let msg_send_alloc: unsafe extern "C" fn(Id, Sel) -> Id = std::mem::transmute(objc_msgSend as *const ());
          let image_alloc: Id = msg_send_alloc(ns_image_cls, alloc_sel);

          let msg_send_init: unsafe extern "C" fn(Id, Sel, Id) -> Id = std::mem::transmute(objc_msgSend as *const ());
          let image: Id = msg_send_init(image_alloc, init_with_data_sel, data);

          if !image.is_null() && !shared_app.is_null() {
              let msg_send_set_icon: unsafe extern "C" fn(Id, Sel, Id) -> Id = std::mem::transmute(objc_msgSend as *const ());
              let _: Id = msg_send_set_icon(shared_app, set_icon_sel, image);
          }
        }
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
