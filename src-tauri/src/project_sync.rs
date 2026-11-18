//! A one-way mirror. Only files previously written by us may be replaced/deleted.
use crate::{api::remote::RemoteBackend, error::AppError};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Read,
    path::{Path, PathBuf},
};
use tokio::io::AsyncWriteExt;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub kind: String,
    pub size: u64,
    #[serde(default)]
    pub version: String,
}
#[derive(Clone, Default, Serialize, Deserialize)]
struct Tracked {
    version: String,
    hash: String,
}
#[derive(Clone, Default, Serialize, Deserialize)]
struct Binding {
    path: PathBuf,
    #[serde(default)]
    tracked: BTreeMap<String, Tracked>,
    #[serde(default)]
    directories: BTreeSet<String>,
}
#[derive(Default, Serialize, Deserialize)]
struct Database {
    bindings: BTreeMap<String, Binding>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub local_path: Option<String>,
    pub files: Vec<FileEntry>,
    pub conflicts: Vec<String>,
    pub synced_at: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePreview {
    pub path: String,
    pub content: Option<String>,
    pub size: u64,
    pub binary: bool,
    pub too_large: bool,
}
pub struct ProjectSync {
    file: PathBuf,
    gate: tokio::sync::Mutex<()>,
}
pub fn display_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    #[cfg(windows)]
    {
        if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{unc}");
        }
        if let Some(local) = value.strip_prefix(r"\\?\") {
            return local.to_owned();
        }
    }
    value.into_owned()
}
fn excluded(name: &str) -> bool {
    matches!(
        name,
        ".uploading"
            | ".git"
            | "node_modules"
            | "target"
            | ".venv"
            | "venv"
            | "__pycache__"
            | ".megvii-sync"
    ) || name.starts_with(".megvii-sync-")
}
pub fn relative(path: &str) -> Result<(), AppError> {
    if path.is_empty()
        || path.split('/').any(|p| {
            let stem = p.split('.').next().unwrap_or("").to_ascii_uppercase();
            p.is_empty()
                || p == "."
                || p == ".."
                || p.ends_with(['.', ' '])
                || excluded(p)
                || p.chars()
                    .any(|c| c.is_control() || "\\:*?\"<>|".contains(c))
                || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
                || (stem.len() == 4
                    && (stem.starts_with("COM") || stem.starts_with("LPT"))
                    && matches!(stem.as_bytes()[3], b'1'..=b'9'))
        })
    {
        return Err(AppError::BadRequest(format!("不支持的同步路径：{path}")));
    }
    Ok(())
}
fn linked(meta: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        meta.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        meta.file_type().is_symlink()
    }
}
fn resolve(root: &Path, path: &str, create: bool) -> Result<PathBuf, AppError> {
    relative(path)?;
    let mut current = root.to_path_buf();
    let parts: Vec<_> = path.split('/').collect();
    for (i, part) in parts.iter().enumerate() {
        current.push(part);
        match std::fs::symlink_metadata(&current) {
            Ok(m) if linked(&m) => return Err(AppError::Conflict(format!("跳过链接：{path}"))),
            Ok(m) if i + 1 < parts.len() && !m.is_dir() => {
                return Err(AppError::Conflict(format!("目录被文件占用：{path}")));
            }
            Ok(_) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                if create && i + 1 < parts.len() {
                    std::fs::create_dir(&current)?;
                }
            }
            Err(e) => return Err(e.into()),
        }
    }
    Ok(current)
}
fn hash(path: &Path) -> Result<String, AppError> {
    let mut f = std::fs::File::open(path)?;
    let mut h = Sha256::new();
    let mut b = [0; 65536];
    loop {
        let n = f.read(&mut b)?;
        if n == 0 {
            break;
        }
        h.update(&b[..n]);
    }
    Ok(format!("{:x}", h.finalize()))
}
fn tree(root: &Path) -> Result<Vec<FileEntry>, AppError> {
    let mut pending = vec![root.to_path_buf()];
    let mut out = vec![];
    while let Some(dir) = pending.pop() {
        for item in std::fs::read_dir(dir)? {
            let item = item?;
            if excluded(&item.file_name().to_string_lossy()) {
                continue;
            }
            let m = std::fs::symlink_metadata(item.path())?;
            if linked(&m) {
                continue;
            }
            if m.is_dir() {
                pending.push(item.path());
            } else if !m.is_file() {
                continue;
            }
            out.push(FileEntry {
                path: item
                    .path()
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/"),
                kind: if m.is_dir() { "directory" } else { "file" }.into(),
                size: if m.is_file() { m.len() } else { 0 },
                version: String::new(),
            });
            if out.len() > 100_000 {
                return Err(AppError::BadRequest(
                    "本地文件超过 100000 个，请缩小项目目录".into(),
                ));
            }
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}
struct Temporary(PathBuf);
impl Drop for Temporary {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}
impl ProjectSync {
    pub fn new(dir: PathBuf) -> Self {
        Self {
            file: dir.join("project-mirrors.json"),
            gate: tokio::sync::Mutex::new(()),
        }
    }
    fn load(&self) -> Result<Database, AppError> {
        match std::fs::read(&self.file) {
            Ok(b) => Ok(serde_json::from_slice(&b)?),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Database::default()),
            Err(e) => Err(e.into()),
        }
    }
    fn save(&self, db: &Database) -> Result<(), AppError> {
        std::fs::create_dir_all(self.file.parent().unwrap())?;
        let temp = self.file.with_extension("tmp");
        std::fs::write(&temp, serde_json::to_vec(db)?)?;
        std::fs::rename(temp, &self.file)?;
        Ok(())
    }
    pub async fn bind(&self, scope: &str, path: &str) -> Result<(), AppError> {
        let _lock = self.gate.lock().await;
        let p = Path::new(path);
        if !p.is_absolute() || !p.is_dir() {
            return Err(AppError::BadRequest("请选择已存在的本地项目目录".into()));
        }
        let p = std::fs::canonicalize(p)?;
        let mut db = self.load()?;
        if db
            .bindings
            .iter()
            .any(|(k, b)| k != scope && (p.starts_with(&b.path) || b.path.starts_with(&p)))
        {
            return Err(AppError::Conflict(
                "该目录与其他同步项目重叠，请选择独立目录".into(),
            ));
        }
        if db.bindings.get(scope).is_some_and(|b| b.path == p) {
            return Ok(());
        }
        db.bindings.insert(
            scope.to_owned(),
            Binding {
                path: p,
                ..Default::default()
            },
        );
        self.save(&db)
    }
    pub async fn local_root(&self, scope: &str) -> Result<PathBuf, AppError> {
        let db = self.load()?;
        let binding = db
            .bindings
            .get(scope)
            .ok_or_else(|| AppError::BadRequest("请先关联本地目录".into()))?;
        let root = std::fs::canonicalize(&binding.path)?;
        if root != binding.path || !root.is_dir() {
            return Err(AppError::Conflict(
                "本地目录已移动或替换，请重新关联".into(),
            ));
        }
        Ok(root)
    }
    pub async fn unbind(&self, scope: &str) -> Result<(), AppError> {
        let _lock = self.gate.lock().await;
        let mut db = self.load()?;
        db.bindings.remove(scope);
        self.save(&db)
    }
    pub async fn sync(
        &self,
        remote: &RemoteBackend,
        token: &str,
        project: &str,
        scope: &str,
    ) -> Result<SyncResult, AppError> {
        let _lock = self.gate.lock().await;
        let mut db = self.load()?;
        let Some(mut binding) = db.bindings.get(scope).cloned() else {
            return Ok(SyncResult {
                local_path: None,
                files: vec![],
                conflicts: vec![],
                synced_at: chrono::Utc::now().to_rfc3339(),
            });
        };
        let root = std::fs::canonicalize(&binding.path)?;
        if root != binding.path || !root.is_dir() {
            return Err(AppError::Conflict(
                "本地目录已移动或替换，请重新关联".into(),
            ));
        }
        let entries = remote.project_manifest(token, project).await?;
        // Validate the COMPLETE manifest before any destructive reconciliation.
        let mut names = BTreeSet::new();
        for entry in &entries {
            relative(&entry.path)?;
            if !matches!(entry.kind.as_str(), "file" | "directory")
                || !names.insert(entry.path.to_lowercase())
            {
                return Err(AppError::Conflict(
                    "远程包含重复或大小写冲突的文件路径".into(),
                ));
            }
        }
        let mut conflicts = vec![];
        for entry in &entries {
            let path = match resolve(&root, &entry.path, true) {
                Ok(p) => p,
                Err(e) => {
                    conflicts.push(format!("{}：{e}", entry.path));
                    continue;
                }
            };
            if entry.kind == "directory" {
                if path.exists() && !path.is_dir() {
                    conflicts.push(entry.path.clone());
                    continue;
                }
                std::fs::create_dir_all(&path)?;
                binding.directories.insert(entry.path.clone());
                continue;
            }
            let old = binding.tracked.get(&entry.path);
            if path.exists() && !path.is_file() {
                conflicts.push(entry.path.clone());
                continue;
            }
            if old.is_some_and(|o| o.version == entry.version) && path.is_file() {
                continue;
            }
            if path.is_file() && old.is_some_and(|o| hash(&path).ok().as_ref() != Some(&o.hash)) {
                conflicts.push(entry.path.clone());
                continue;
            }
            let temp = Temporary(
                path.parent()
                    .unwrap()
                    .join(format!(".megvii-sync-{}", uuid::Uuid::new_v4())),
            );
            let response = remote
                .project_file(token, project, &entry.path, &entry.version)
                .await?;
            let mut f = tokio::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp.0)
                .await?;
            let mut stream = response.bytes_stream();
            let mut digest = Sha256::new();
            let mut size = 0u64;
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|e| AppError::Network(e.to_string()))?;
                size += chunk.len() as u64;
                if size > entry.size {
                    return Err(AppError::Conflict("远程文件正在变化，稍后重试".into()));
                }
                digest.update(&chunk);
                f.write_all(&chunk).await?;
            }
            f.flush().await?;
            drop(f);
            if size != entry.size {
                return Err(AppError::Conflict("远程文件下载不完整，稍后重试".into()));
            }
            let digest = format!("{:x}", digest.finalize());
            // Verify it still has the same revision after streaming a changing file.
            let latest = remote
                .project_file(token, project, &entry.path, &entry.version)
                .await?;
            drop(latest);
            // Recheck local state immediately before replacing, including links.
            resolve(&root, &entry.path, false)?;
            if path.exists() {
                let current = hash(&path)?;
                if old.map_or(current != digest, |o| {
                    current != o.hash && current != digest
                }) {
                    conflicts.push(entry.path.clone());
                    continue;
                }
            }
            std::fs::rename(&temp.0, &path)?;
            binding.tracked.insert(
                entry.path.clone(),
                Tracked {
                    version: entry.version.clone(),
                    hash: digest,
                },
            );
            // Persist per file, so an interrupted batch cannot forget files it wrote.
            db.bindings.insert(scope.to_owned(), binding.clone());
            self.save(&db)?;
        }
        let remote_files: BTreeSet<_> = entries.iter().map(|e| e.path.as_str()).collect();
        let removed: Vec<_> = binding
            .tracked
            .keys()
            .filter(|p| !remote_files.contains(p.as_str()))
            .cloned()
            .collect();
        for name in removed {
            match resolve(&root, &name, false) {
                Ok(path) => {
                    if path.exists() {
                        if !path.is_file() || hash(&path)? != binding.tracked[&name].hash {
                            conflicts.push(name);
                            continue;
                        }
                        std::fs::remove_file(path)?;
                    }
                    binding.tracked.remove(&name);
                }
                Err(_) => conflicts.push(name),
            }
        }
        let dirs: Vec<_> = binding
            .directories
            .iter()
            .rev()
            .filter(|p| !remote_files.contains(p.as_str()))
            .cloned()
            .collect();
        for dir in dirs {
            if let Ok(path) = resolve(&root, &dir, false) {
                let _ = std::fs::remove_dir(path);
            }
            binding.directories.remove(&dir);
        }
        db.bindings.insert(scope.to_owned(), binding);
        self.save(&db)?;
        Ok(SyncResult {
            local_path: Some(display_path(root.as_path())),
            files: tree(&root)?,
            conflicts,
            synced_at: chrono::Utc::now().to_rfc3339(),
        })
    }
}
pub fn browse(root: &Path) -> Result<SyncResult, AppError> {
    Ok(SyncResult {
        local_path: Some(display_path(root)),
        files: tree(root)?,
        conflicts: vec![],
        synced_at: chrono::Utc::now().to_rfc3339(),
    })
}
pub fn preview(root: &Path, name: &str) -> Result<FilePreview, AppError> {
    let path = resolve(root, name, false)?;
    let file = std::fs::File::open(path)?;
    let meta = file.metadata()?;
    if !meta.is_file() {
        return Err(AppError::BadRequest("请选择文件".into()));
    }
    let mut bytes = vec![];
    if meta.len() <= 2 * 1024 * 1024 {
        file.take(2 * 1024 * 1024 + 1).read_to_end(&mut bytes)?;
    }
    let too_large = meta.len() > 2 * 1024 * 1024 || bytes.len() > 2 * 1024 * 1024;
    let content = if !too_large && !bytes.contains(&0) {
        String::from_utf8(bytes).ok()
    } else {
        None
    };
    Ok(FilePreview {
        path: name.into(),
        size: meta.len(),
        binary: !too_large && content.is_none(),
        content,
        too_large,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn windows_safe_paths() {
        for p in [
            "../a",
            "a/../b",
            "/a",
            "C:/x",
            "a\\b",
            "CON.txt",
            "COM1",
            "x:stream",
            "a.",
            "a ",
            ".git/config",
        ] {
            assert!(relative(p).is_err(), "{p}")
        }
        assert!(relative("repo/src/main.rs").is_ok());
    }
    #[test]
    fn local_preview_handles_binary_and_code() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir(&dir).unwrap();
        std::fs::write(dir.join("test.rs"), "fn main() {}\n").unwrap();
        std::fs::write(dir.join("model.bin"), [0, 255]).unwrap();
        assert_eq!(
            preview(&dir, "test.rs").unwrap().content.as_deref(),
            Some("fn main() {}\n")
        );
        assert!(preview(&dir, "model.bin").unwrap().binary);
        assert!(preview(&dir, "../escape").is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[tokio::test]
    async fn mirrors_changes_preserves_local_conflicts_and_reconciles_deletes() {
        use tokio::{
            io::{AsyncReadExt, AsyncWriteExt},
            net::TcpListener,
        };
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let files = std::sync::Arc::new(tokio::sync::RwLock::new(BTreeMap::from([(
            "repo/code.py".to_owned(),
            ("v1".to_owned(), b"print(1)\n".to_vec()),
        )])));
        let shared = files.clone();
        let server = tokio::spawn(async move {
            loop {
                let (mut socket, _) = listener.accept().await.unwrap();
                let shared = shared.clone();
                tokio::spawn(async move {
                    let mut request = vec![];
                    loop {
                        let mut b = [0u8; 2048];
                        let n = socket.read(&mut b).await.unwrap();
                        if n == 0 {
                            return;
                        }
                        request.extend_from_slice(&b[..n]);
                        if request.windows(4).any(|b| b == b"\r\n\r\n") {
                            break;
                        }
                    }
                    let request = String::from_utf8_lossy(&request);
                    assert!(
                        request
                            .to_lowercase()
                            .contains("authorization: bearer test")
                    );
                    let url = request.split_whitespace().nth(1).unwrap();
                    let snapshot = shared.read().await;
                    let body = if url.ends_with("/files") {
                        let mut entries = vec![
                            serde_json::json!({"path":"repo","kind":"directory","size":0,"version":"dir"}),
                        ];
                        entries.extend(snapshot.iter().map(|(p,(v,b))|serde_json::json!({"path":p,"kind":"file","size":b.len(),"version":v})));
                        serde_json::to_vec(&entries).unwrap()
                    } else {
                        let u = reqwest::Url::parse(&format!("http://test{url}")).unwrap();
                        let path = u
                            .query_pairs()
                            .find(|(k, _)| k == "path")
                            .unwrap()
                            .1
                            .to_string();
                        snapshot[&path].1.clone()
                    };
                    let header = format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    socket.write_all(header.as_bytes()).await.unwrap();
                    let _ = socket.write_all(&body).await;
                });
            }
        });
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        let local = dir.join("local");
        std::fs::create_dir_all(&local).unwrap();
        let sync = ProjectSync::new(dir.join("state"));
        sync.bind("account-project", local.to_str().unwrap())
            .await
            .unwrap();
        let remote = RemoteBackend::with_url(format!("http://{address}/v1"));
        assert!(
            sync.sync(&remote, "test", "project", "account-project")
                .await
                .unwrap()
                .conflicts
                .is_empty()
        );
        let path = local.join("repo/code.py");
        assert_eq!(std::fs::read(&path).unwrap(), b"print(1)\n");
        files
            .write()
            .await
            .insert("repo/code.py".into(), ("v2".into(), b"print(2)\n".to_vec()));
        sync.sync(&remote, "test", "project", "account-project")
            .await
            .unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"print(2)\n");
        std::fs::write(&path, b"local edits").unwrap();
        files.write().await.insert(
            "repo/code.py".into(),
            ("v3".into(), b"remote edits".to_vec()),
        );
        let conflict = sync
            .sync(&remote, "test", "project", "account-project")
            .await
            .unwrap();
        assert_eq!(conflict.conflicts, vec!["repo/code.py"]);
        assert_eq!(std::fs::read(&path).unwrap(), b"local edits");
        files.write().await.clear();
        let conflict = sync
            .sync(&remote, "test", "project", "account-project")
            .await
            .unwrap();
        assert_eq!(conflict.conflicts, vec!["repo/code.py"]);
        assert!(path.exists());
        std::fs::write(&path, b"print(2)\n").unwrap();
        std::fs::write(local.join("notes.txt"), b"private notes").unwrap();
        sync.sync(&remote, "test", "project", "account-project")
            .await
            .unwrap();
        assert!(!path.exists());
        assert!(local.join("notes.txt").exists());
        assert!(sync.bind("other", local.to_str().unwrap()).await.is_err());
        server.abort();
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[tokio::test]
    #[ignore = "requires a dedicated remote file-sync fixture"]
    async fn real_backend_files_download_to_windows_directory() {
        let remote = RemoteBackend::with_url(std::env::var("MEGVII_SYNC_TEST_URL").unwrap());
        let token = std::env::var("MEGVII_SYNC_TEST_TOKEN").unwrap();
        let project = std::env::var("MEGVII_SYNC_TEST_PROJECT").unwrap();
        let scope = remote.mirror_scope(&token, &project).await.unwrap();
        let dir = std::env::temp_dir().join(format!("megvii-sync-live-{}", uuid::Uuid::new_v4()));
        let local = dir.join("project");
        std::fs::create_dir_all(&local).unwrap();
        let sync = ProjectSync::new(dir.join("state"));
        sync.bind(&scope, local.to_str().unwrap()).await.unwrap();
        let result = sync.sync(&remote, &token, &project, &scope).await.unwrap();
        assert!(result.conflicts.is_empty());
        assert_eq!(
            std::fs::read(local.join("repo/src/main.py")).unwrap(),
            b"print('synchronized')\n"
        );
        assert_eq!(
            hash(&local.join("repo/model.bin")).unwrap(),
            std::env::var("MEGVII_SYNC_TEST_HASH").unwrap()
        );
        assert!(
            preview(&std::fs::canonicalize(&local).unwrap(), "repo/model.bin")
                .unwrap()
                .binary
        );
        std::fs::remove_dir_all(dir).unwrap();
    }
}
