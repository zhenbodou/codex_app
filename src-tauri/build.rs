fn main() {
    // Windows embeds the ICO in the executable; changing it must rerun this build script.
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/128x128.png");
    tauri_build::build()
}
