use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AvdSource {
    #[default]
    Local,
    System,
}

impl AvdSource {
    pub fn id(self, name: &str) -> String {
        match self {
            Self::Local => name.to_string(),
            Self::System => format!("system:{name}"),
        }
    }

    pub fn sdk(self) -> Option<PathBuf> {
        match self {
            Self::Local => Some(sdk_dir()),
            Self::System => ["ANDROID_HOME", "ANDROID_SDK_ROOT"]
                .into_iter()
                .filter_map(std::env::var_os)
                .map(PathBuf::from)
                .chain(dirs::data_local_dir().filter(|_| cfg!(windows)).map(|dir| dir.join("Android").join("Sdk")))
                .find(|path| path.is_absolute() && path.is_dir()),
        }
    }

    pub fn avd_home(self) -> Option<PathBuf> {
        match self {
            Self::Local => Some(avd_dir()),
            Self::System => {
                if let Some(path) = std::env::var_os("ANDROID_AVD_HOME").filter(|path| !path.is_empty()) {
                    return Some(PathBuf::from(path));
                }
                ["ANDROID_USER_HOME", "ANDROID_EMULATOR_HOME"]
                    .into_iter()
                    .find_map(|key| std::env::var_os(key).filter(|path| !path.is_empty()))
                    .map(PathBuf::from)
                    .or_else(|| dirs::home_dir().map(|home| home.join(".android")))
                    .map(|home| home.join("avd"))
            }
        }
    }

    pub fn locate(self, name: &str) -> Option<RegisteredAvd> {
        if name.is_empty() || !name.bytes().all(|ch| ch.is_ascii_alphanumeric() || b"._-".contains(&ch)) {
            return None;
        }
        let home = self.avd_home()?;
        let ini = std::fs::read_to_string(home.join(format!("{name}.ini"))).ok()?;
        let sibling = home.join(format!("{name}.avd"));
        let folder = if self == Self::System {
            let registered = PathBuf::from(ini_value(&ini, "path"));
            if registered.is_absolute() && registered.join("config.ini").is_file() {
                registered
            } else {
                sibling
            }
        } else {
            sibling
        };
        let config_path = folder.join("config.ini");
        let config = std::fs::read_to_string(&config_path).ok()?;
        Some(RegisteredAvd { home, config_path, config })
    }
}

pub struct RegisteredAvd {
    pub home: PathBuf,
    pub config_path: PathBuf,
    pub config: String,
}

impl RegisteredAvd {
    pub fn in_use(&self, source: AvdSource, name: &str) -> bool {
        super::running_avds().lock().unwrap().contains_key(&source.id(name))
            || (source == AvdSource::System && emulator_lock_in_use(&self.config_path))
    }

    pub fn use_compatible_graphics(&self, source: AvdSource) -> bool {
        cfg!(windows)
            && source == AvdSource::System
            && ini_value(&self.config, "abi.type") == "x86"
            && ini_value(&self.config, "hw.gpu.mode") != "host"
    }
}

fn emulator_lock_in_use(config_path: &Path) -> bool {
    let lock = config_path.with_file_name("hardware-qemu.ini.lock");
    if !lock.exists() {
        return false;
    }
    let owner = std::fs::read_to_string(lock.join("pid"))
        .ok()
        .and_then(|value| value.trim().parse::<u32>().ok())
        .filter(|pid| *pid != 0);
    match owner {
        Some(pid) => sysinfo::System::new().refresh_process(sysinfo::Pid::from_u32(pid)),
        // The emulator might be creating the lock and has not written its PID yet.
        None => true,
    }
}

pub fn ini_value<'a>(content: &'a str, key: &str) -> &'a str {
    content.lines().find_map(|line| {
        let (name, value) = line.split_once('=')?;
        (name.trim() == key).then(|| value.trim())
    }).unwrap_or_default()
}

pub fn android_tool(sdk: &Path, directory: &str, name: &str, windows_extension: &str) -> PathBuf {
    let path = sdk.join(directory).join(name);
    if cfg!(windows) { path.with_extension(windows_extension) } else { path }
}

// ─── Path helpers ─────────────────────────────────────────────────────────────
pub fn sdk_base() -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_default();
    let dir = exe.parent().unwrap_or(Path::new("."));

    // Traverse upwards to check if we are in development mode (project contains src-tauri folder)
    let mut current = dir.to_path_buf();
    for _ in 0..10 {
        if current.join("src-tauri").exists() {
            return current.join("android-sdk");
        }
        if let Some(parent) = current.parent() {
            current = parent.to_path_buf();
        } else {
            break;
        }
    }

    // Production fallback: next to the executable
    dir.join("android-sdk")
}

pub fn jdk_dir() -> PathBuf {
    sdk_base().join("jdk")
}
pub fn sdk_dir() -> PathBuf {
    sdk_base().join("sdk")
}
pub fn cmdline_dir() -> PathBuf {
    sdk_dir().join("cmdline-tools").join("latest")
}
pub fn emulator_dir() -> PathBuf {
    sdk_dir().join("emulator")
}
pub fn avd_dir() -> PathBuf {
    sdk_base().join("avd")
}

pub fn ensure_dirs(base: &PathBuf) {
    let _ = base; // we use sdk_base() internally
    for d in [sdk_base(), jdk_dir(), sdk_dir(), avd_dir()] {
        let _ = std::fs::create_dir_all(&d);
    }
}

pub fn get_java_exe() -> Option<PathBuf> {
    let jdk = jdk_dir();
    if !jdk.exists() {
        return None;
    }
    let entry = std::fs::read_dir(&jdk)
        .ok()?
        .filter_map(|e| e.ok())
        .find(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with("jdk")
        })?;
    #[cfg(windows)]
    let java = entry.path().join("bin").join("java.exe");
    #[cfg(not(windows))]
    let java = entry.path().join("bin").join("java");
    if java.exists() {
        Some(java)
    } else {
        None
    }
}

pub fn get_java_home() -> Option<PathBuf> {
    let jdk = jdk_dir();
    let entry = std::fs::read_dir(&jdk)
        .ok()?
        .filter_map(|e| e.ok())
        .find(|e| e.file_name().to_string_lossy().starts_with("jdk"))?;
    Some(entry.path())
}

pub fn build_env() -> HashMap<String, String> {
    let mut env: HashMap<String, String> = std::env::vars().collect();
    if let Some(jh) = get_java_home() {
        env.insert("JAVA_HOME".to_string(), jh.to_string_lossy().to_string());
        let bin = jh.join("bin").to_string_lossy().to_string();
        let path = env.get("PATH").cloned().unwrap_or_default();
        #[cfg(windows)]
        env.insert("PATH".to_string(), format!("{};{}", bin, path));
        #[cfg(not(windows))]
        env.insert("PATH".to_string(), format!("{}:{}", bin, path));
    }
    env.insert("ANDROID_HOME".to_string(), sdk_dir().to_string_lossy().to_string());
    env.insert("ANDROID_SDK_ROOT".to_string(), sdk_dir().to_string_lossy().to_string());
    env.insert("ANDROID_AVD_HOME".to_string(), avd_dir().to_string_lossy().to_string());
    env.insert("ANDROID_EMULATOR_HOME".to_string(), avd_dir().to_string_lossy().to_string());
    
    // Low-latency WASAPI Audio Optimizations (Windows only — harmless to set on other OS)
    env.insert("QEMU_AUDIO_TIMER_PERIOD".to_string(), "0".to_string());
    env.insert("QEMU_WASAPI_BUF_SIZE".to_string(), "512".to_string());

    env
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn live_and_stale_emulator_locks_are_distinguished() {
        let root = std::env::temp_dir().join(format!("kb-avd-lock-test-{}", std::process::id()));
        fs::create_dir(&root).unwrap();
        let config = root.join("config.ini");
        let lock = root.join("hardware-qemu.ini.lock");
        assert!(!emulator_lock_in_use(&config));
        fs::create_dir(&lock).unwrap();
        assert!(emulator_lock_in_use(&config));

        let owner = lock.join("pid");
        fs::write(&owner, std::process::id().to_string()).unwrap();
        assert!(emulator_lock_in_use(&config));
        fs::write(&owner, u32::MAX.to_string()).unwrap();
        assert!(!emulator_lock_in_use(&config));

        fs::remove_file(owner).unwrap();
        fs::remove_dir(lock).unwrap();
        fs::remove_dir(root).unwrap();
    }

    #[test]
    fn windows_system_x86_uses_compatible_graphics_except_with_explicit_host_mode() {
        let mut avd = RegisteredAvd {
            home: PathBuf::new(),
            config_path: PathBuf::new(),
            config: "abi.type=x86\nhw.gpu.mode=auto".into(),
        };
        assert_eq!(avd.use_compatible_graphics(AvdSource::System), cfg!(windows));
        assert!(!avd.use_compatible_graphics(AvdSource::Local));
        avd.config = "abi.type=x86_64\nhw.gpu.mode=auto".into();
        assert!(!avd.use_compatible_graphics(AvdSource::System));
        avd.config = "abi.type=x86\nhw.gpu.mode=host".into();
        assert!(!avd.use_compatible_graphics(AvdSource::System));
    }
}
