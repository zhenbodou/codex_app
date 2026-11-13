//! Import selected model files without loading large weights into the WebView.
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelFile {
    pub name: String,
    pub path: String,
    pub size: u64,
}

pub fn describe(path: &Path) -> Result<ModelFile, AppError> {
    let metadata = std::fs::metadata(path)?;
    if !metadata.is_file() {
        return Err(AppError::BadRequest("请选择模型文件，而不是目录".into()));
    }
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| AppError::BadRequest("文件名无效".into()))?;
    Ok(ModelFile {
        name: name.into(),
        path: path.to_string_lossy().into_owned(),
        size: metadata.len(),
    })
}

pub fn import(project_path: &Path, paths: Vec<String>) -> Result<Vec<ModelFile>, AppError> {
    if paths.is_empty() {
        return Ok(Vec::new());
    }
    // Canonicalize the existing workspace; never create a mistyped project directory.
    let workspace = std::fs::canonicalize(project_path)?;
    if !workspace.is_dir() {
        return Err(AppError::BadRequest("项目工作目录不存在".into()));
    }
    let mut sources = Vec::new();
    for path in paths {
        let source = std::fs::canonicalize(PathBuf::from(path))?;
        describe(&source)?;
        if !sources.contains(&source) {
            sources.push(source);
        }
    }
    // Use a visible directory so local coding agents can find the imported weights.
    let models = workspace.join("megvii-models");
    std::fs::create_dir_all(&models)?;
    let models = std::fs::canonicalize(models)?;
    if !models.starts_with(&workspace) {
        return Err(AppError::BadRequest(
            "模型目录不能指向工作目录以外的位置".into(),
        ));
    }
    let batch = models.join(crate::models::new_id());
    std::fs::create_dir(&batch)?;
    let result = (|| {
        let mut out = Vec::new();
        for (index, source) in sources.iter().enumerate() {
            let folder = batch.join(index.to_string());
            std::fs::create_dir(&folder)?;
            let destination = folder.join(source.file_name().unwrap());
            std::fs::copy(source, &destination)?;
            out.push(describe(&destination)?);
        }
        Ok(out)
    })();
    if result.is_err() {
        // Only remove the unique batch directory created by this call.
        let _ = std::fs::remove_dir_all(&batch);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn multiple_models_with_same_name_are_preserved() {
        let root =
            std::env::temp_dir().join(format!("megvii-model-test-{}", crate::models::new_id()));
        let workspace = root.join("workspace");
        for folder in ["workspace", "a", "b"] {
            std::fs::create_dir_all(root.join(folder)).unwrap();
        }
        let a = root.join("a/model.onnx");
        let b = root.join("b/model.onnx");
        std::fs::write(&a, b"first").unwrap();
        std::fs::write(&b, b"second").unwrap();
        let out = import(
            &workspace,
            vec![a.to_string_lossy().into(), b.to_string_lossy().into()],
        )
        .unwrap();
        assert_eq!(out.len(), 2);
        assert_ne!(out[0].path, out[1].path);
        assert_eq!(std::fs::read(&out[0].path).unwrap(), b"first");
        assert_eq!(std::fs::read(&out[1].path).unwrap(), b"second");
        assert!(
            std::fs::canonicalize(&out[0].path)
                .unwrap()
                .starts_with(std::fs::canonicalize(workspace).unwrap())
        );
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn missing_model_does_not_leave_a_partial_batch() {
        let root =
            std::env::temp_dir().join(format!("megvii-model-test-{}", crate::models::new_id()));
        std::fs::create_dir_all(&root).unwrap();
        assert!(
            import(
                &root,
                vec![root.join("missing.onnx").to_string_lossy().into()]
            )
            .is_err()
        );
        assert!(!root.join("megvii-models").exists());
        std::fs::remove_dir_all(root).unwrap();
    }
}
