use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::Stdio;
use serde_json::json;
use tauri::{Emitter, Window};

use super::emit_log;

use super::avd::{auto_repair_special_configs, auto_tune_heap_before_launch, clean_stale_locks};
use super::paths::{android_tool, build_env, AvdSource};
use super::types::CommandResult;
use super::{running_avds, RunningAvd};

// Windows-only: raw Win32 API for process priority elevation
#[cfg(windows)]
mod win32_priority {
    #[link(name = "kernel32")]
    extern "system" {
        pub fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> *mut std::ffi::c_void;
        pub fn SetPriorityClass(hProcess: *mut std::ffi::c_void, dwPriorityClass: u32) -> i32;
        pub fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
    }

    pub const PROCESS_SET_INFORMATION: u32 = 0x0200;
    pub const HIGH_PRIORITY_CLASS: u32 = 0x00000080;
}

// ─── Launch AVD ───────────────────────────────────────────────────────────────
#[tauri::command]
pub fn launch_avd(
    name: String,
    source: Option<AvdSource>,
    gpu_mode: Option<String>,
    accel: Option<String>,
    quick_boot: Option<bool>,
    boot_anim: Option<bool>,
    no_camera: Option<bool>,
    no_gps: Option<bool>,
    no_bluetooth: Option<bool>,
    read_only: Option<bool>,
    wipe_data: Option<bool>,
    speed_mode: Option<bool>,
    raw_launch: Option<bool>,
    window: Window,
) -> CommandResult {
    let source = source.unwrap_or_default();
    let id = source.id(&name);
    let Some(avd) = source.locate(&name) else {
        return CommandResult { ok: false, error: Some("AVD not found".into()), output: None };
    };
    if avd.in_use(source, &name) {
        return CommandResult { ok: false, error: Some("AVD is in use".into()), output: None };
    }
    let Some(sdk) = source.sdk() else {
        return CommandResult { ok: false, error: Some("Android SDK not found".into()), output: None };
    };
    let emulator_exe = android_tool(&sdk, "emulator", "emulator", "exe");
    if !emulator_exe.is_file() {
        return CommandResult {
            ok: false,
            error: Some("Emulator not installed. Install it from SDK Manager first.".into()),
            output: None,
        };
    }

    // Detect Device Type
    let mut is_wear = false;
    let mut is_tv = false;
    let mut is_auto = false;
    for line in avd.config.lines() {
        let trimmed = line.trim();
        if let Some(tag) = trimmed.strip_prefix("tag.id=") {
            is_wear |= tag.contains("wear");
            is_tv |= tag.contains("tv");
            is_auto |= tag.contains("automotive");
        }
        if let Some(sysdir) = trimmed.strip_prefix("image.sysdir.1=") {
            is_wear |= sysdir.contains("wear");
            is_tv |= sysdir.contains("android-tv") || sysdir.contains("google-tv");
            is_auto |= sysdir.contains("android-automotive");
        }
    }

    let is_raw = source == AvdSource::System || raw_launch.unwrap_or(false) || is_wear || is_tv || is_auto;

    if !is_raw {
        auto_repair_special_configs(&name);
    }
    if source == AvdSource::Local {
        clean_stale_locks(&name);
    }

    let ram_size = if !is_raw {
        auto_tune_heap_before_launch(&name)
    } else {
        4096
    };

    // Auto-repair AVD .ini path if it was moved/migrated
    let ini_path = avd.home.join(format!("{}.ini", name));
    if source == AvdSource::Local {
        if let Ok(content) = std::fs::read_to_string(&ini_path) {
            let mut new_lines = vec![];
            let mut changed = false;
            let expected_path = avd.config_path.parent().unwrap();
            for line in content.lines() {
                if line.starts_with("path=") {
                    let current_path = line.trim_start_matches("path=");
                    if Path::new(current_path) != expected_path {
                        new_lines.push(format!("path={}", expected_path.to_string_lossy()));
                        changed = true;
                        continue;
                    }
                }
                new_lines.push(line.to_string());
            }
            if changed {
                let _ = std::fs::write(&ini_path, new_lines.join("\n"));
            }
        }
    }

    let mut args = vec![];

    if is_raw {
        emit_log(
            &window,
            "log_avd_launch_raw",
            "info",
            json!({ "name": name }),
        );
        args.push("-avd".to_string());
        args.push(name.clone());
        if avd.use_compatible_graphics(source) {
            args.extend(["-gpu", "swiftshader", "-feature", "-Vulkan", "-no-snapshot"].map(str::to_owned));
            emit_log(&window, "log_avd_compatible_graphics", "info", json!({ "name": name }));
        }
    } else {
        let mut gpu = gpu_mode.unwrap_or_else(|| "auto".to_string());
        
        // Normalize to official supported CLI modes: auto, host, software
        if gpu == "angle_indirect" {
            gpu = "host".to_string();
        } else if gpu == "swiftshader_indirect" {
            gpu = "software".to_string();
        } else if gpu != "host" && gpu != "software" {
            gpu = "auto".to_string();
        }
        let mut accelerator = accel.unwrap_or_else(|| "whpx".to_string());

        // Map legacy hypervisor selections to unified flags for Android Emulator 36+
        if accelerator == "whpx" || accelerator == "aehd" || accelerator == "haxm" {
            accelerator = "on".to_string();
        }
        // On Linux, "kvm" maps to "on" as well
        #[cfg(not(windows))]
        if accelerator == "kvm" {
            accelerator = "on".to_string();
        }

        emit_log(
            &window,
            "log_avd_launch",
            "info",
            json!({ "name": name, "gpu": gpu, "accelerator": accelerator }),
        );

        let (heap_sz, growth_lim) = if is_wear {
            ("128m", "64m")
        } else if is_tv {
            ("256m", "128m")
        } else if is_auto {
            ("512m", "256m")
        } else if ram_size >= 8192 {
            ("1024m", "512m")
        } else {
            ("512m", "256m")
        };

        args = vec![
            "-avd".to_string(),
            name.clone(),
            "-gpu".to_string(),
            gpu,
            "-accel".to_string(),
            accelerator,
            "-feature".to_string(),
            "Vulkan,GLESDynamicVersion".to_string(),
            "-logcat".to_string(),
            "*:S".to_string(),
            "-no-metrics".to_string(),
            "-prop".to_string(),
            format!("qemu.dalvik.vm.heapsize={}", heap_sz),
            "-prop".to_string(),
            format!("qemu.dalvik.vm.heapgrowthlimit={}", growth_lim),
            "-prop".to_string(),
            "qemu.net.tcp.buffersize.default=4096,87380,110208,4096,16384,110208".to_string(),
            "-prop".to_string(),
            "qemu.net.tcp.buffersize.wifi=262144,524288,1048576,262144,524288,1048576".to_string(),
            "-dns-server".to_string(),
            "1.1.1.1".to_string(),
        ];

        // WASAPI audio is Windows-only
        #[cfg(windows)]
        {
            args.push("-audio".to_string());
            args.push("wasapi".to_string());
        }

        if let Some(false) = quick_boot {
            args.push("-no-snapshot-load".to_string());
            args.push("-no-snapshot-save".to_string());
        }

        if let Some(true) = read_only {
            args.push("-read-only".to_string());
        }

        if let Some(false) = boot_anim {
            args.push("-no-boot-anim".to_string());
        }

        if let Some(true) = no_camera {
            args.push("-camera-back".to_string());
            args.push("none".to_string());
            args.push("-camera-front".to_string());
            args.push("none".to_string());
        }
        if let Some(true) = no_gps {
            args.push("-no-passive-gps".to_string());
        }

        let mut netsim_flags: Vec<&str> = vec!["--no-cli-ui"];
        if let Some(true) = no_bluetooth {
            netsim_flags.push("--no-bluetooth");
        }
        for flag in &netsim_flags {
            args.push("-netsim-args".to_string());
            args.push(flag.to_string());
        }
    }

    if wipe_data == Some(true) {
        args.push("-wipe-data".to_string());
    }

    let mut cmd = std::process::Command::new(&emulator_exe);
    if source == AvdSource::Local {
        cmd.envs(build_env());
    }
    cmd.current_dir(emulator_exe.parent().unwrap())
        .args(&args)
        .env("ANDROID_HOME", &sdk)
        .env("ANDROID_SDK_ROOT", &sdk)
        .env("ANDROID_AVD_HOME", &avd.home)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut running = running_avds().lock().unwrap();
    if running.contains_key(&id) {
        return CommandResult { ok: false, error: Some("AVD is already running".into()), output: None };
    }
    let child = cmd.spawn();

    match child {
        Ok(mut c) => {
            let pid = c.id();

            // Elevate process priority — Windows only
            #[cfg(windows)]
            unsafe {
                use win32_priority::*;
                let handle = OpenProcess(PROCESS_SET_INFORMATION, 0, pid);
                if !handle.is_null() {
                    let success = SetPriorityClass(handle, HIGH_PRIORITY_CLASS);
                    println!("[Backend] Elevated emulator.exe (PID {}) priority: {}", pid, success != 0);
                    CloseHandle(handle);
                }
            }

            running.insert(id.clone(), RunningAvd { pid, boot_completed: false, stop_requested: false });
            drop(running);

            if source == AvdSource::Local && speed_mode == Some(true) && AvdSource::System.locate(&name).is_none() {
                let adb_exe = android_tool(&sdk, "platform-tools", "adb", "exe");

                let name_clone3 = name.clone();
                let window_clone3 = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(4));
                    if let Some(serial) = adb_serial(&adb_exe, &name_clone3) {
                        let _ = std::process::Command::new(&adb_exe)
                            .args(["-s", &serial, "wait-for-device"])
                            .output();

                        let _ = std::process::Command::new(&adb_exe)
                            .args(["-s", &serial, "root"])
                            .output();

                        let _ = std::process::Command::new(&adb_exe)
                            .args(["-s", &serial, "wait-for-device"])
                            .output();
                        
                        let _ = std::process::Command::new(&adb_exe)
                            .args(["-s", &serial, "shell", "service", "call", "SurfaceFlinger", "1008", "i32", "1"])
                            .output();
                        
                        emit_log(
                            &window_clone3,
                            "log_avd_speed_enabled",
                            "info",
                            json!({ "name": name_clone3 }),
                        );
                    }
                });
            }

            if let Some(stdout) = c.stdout.take() {
                capture_emulator_output(stdout, window.clone(), id.clone(), name.clone(), pid);
            }
            if let Some(stderr) = c.stderr.take() {
                capture_emulator_output(stderr, window.clone(), id.clone(), name.clone(), pid);
            }
            let adb_exe = android_tool(&sdk, "platform-tools", "adb", "exe");
            let other_source = if source == AvdSource::Local { AvdSource::System } else { AvdSource::Local };
            if adb_exe.is_file() && other_source.locate(&name).is_none() {
                watch_for_android_boot(adb_exe, id.clone(), name.clone(), pid);
            }

            let name_clone2 = name.clone();
            let window_clone2 = window.clone();
            std::thread::spawn(move || {
                let launch_time = std::time::Instant::now();
                let status = c.wait().ok();
                let elapsed = launch_time.elapsed().as_secs();
                let process = running_avds().lock().unwrap().remove(&id);
                let failed = !process.is_some_and(|avd| avd.stop_requested)
                    && (!process.is_some_and(|avd| avd.boot_completed)
                        || !status.is_some_and(|status| status.success()));

                if elapsed < 10 && failed {
                    let snapshot_dir = avd.config_path.with_file_name("snapshots");
                    if source == AvdSource::Local && status.is_some_and(|status| !status.success()) && snapshot_dir.exists() {
                        let _ = std::fs::remove_dir_all(&snapshot_dir);
                        let _ = window_clone2.emit(
                            "emulator-log",
                            json!({
                                "id": id,
                                "name": name_clone2,
                                "line": "[KB] Emulator crashed immediately — corrupted snapshot auto-deleted. Please launch again for a clean cold boot."
                            }),
                        );
                    } else {
                        let _ = window_clone2.emit(
                            "emulator-log",
                            json!({
                                "id": id,
                                "name": name_clone2,
                                "line": "[KB] Emulator exited unexpectedly during launch. See the preceding emulator output."
                            }),
                        );
                    }
                }

                let _ = window_clone2.emit("emulator-exit", json!({
                    "name": name_clone2,
                    "failed": failed,
                    "code": status.and_then(|status| status.code())
                }));
            });
            CommandResult { ok: true, error: None, output: Some(pid.to_string()) }
        }
        Err(e) => CommandResult { ok: false, error: Some(e.to_string()), output: None },
    }
}

fn capture_emulator_output(stream: impl Read + Send + 'static, window: Window, id: String, name: String, pid: u32) {
    std::thread::spawn(move || {
        let mut seen = std::collections::VecDeque::with_capacity(256);
        for line in BufReader::new(stream).lines().map_while(Result::ok) {
            let line = line.trim().to_string();
            if line.is_empty() || seen.contains(&line) { continue; }
            if line.split_once('|').map_or(line.as_str(), |(_, message)| message.trim()).starts_with("Boot completed in ") {
                mark_android_booted(&id, pid);
            }
            let _ = window.emit("emulator-log", json!({ "id": id, "name": name, "line": line }));
            if seen.len() == 256 { seen.pop_front(); }
            seen.push_back(line);
        }
    });
}

fn mark_android_booted(id: &str, pid: u32) {
    if let Some(avd) = running_avds().lock().unwrap().get_mut(id).filter(|avd| avd.pid == pid) {
        avd.boot_completed = true;
    }
}

fn watch_for_android_boot(adb: std::path::PathBuf, id: String, name: String, pid: u32) {
    std::thread::spawn(move || {
        let mut serial = None;
        for _ in 0..90 {
            std::thread::sleep(std::time::Duration::from_secs(2));
            let process = running_avds().lock().unwrap().get(&id).copied();
            if !process.is_some_and(|avd| avd.pid == pid && !avd.boot_completed && !avd.stop_requested) {
                break;
            }
            if serial.is_none() {
                serial = adb_serial(&adb, &name);
            }
            if let Some(serial) = serial.as_deref() {
                let booted = crate::new_command!(&adb)
                    .args(["-s", serial, "shell", "getprop", "sys.boot_completed"])
                    .output()
                    .is_ok_and(|output| output.status.success() && String::from_utf8_lossy(&output.stdout).trim() == "1");
                if booted {
                    mark_android_booted(&id, pid);
                    break;
                }
            }
        }
    });
}

// ─── Stop AVD ─────────────────────────────────────────────────────────────────
#[tauri::command]
pub fn stop_avd(name: String, source: Option<AvdSource>, window: Window) -> CommandResult {
    let source = source.unwrap_or_default();
    let id = source.id(&name);
    let pid = running_avds().lock().unwrap().get_mut(&id).map(|avd| {
        avd.stop_requested = true;
        avd.pid
    });
    let Some(pid) = pid else {
        return CommandResult { ok: false, error: Some("AVD is not running in KB".into()), output: None };
    };
    let other_source = if source == AvdSource::Local { AvdSource::System } else { AvdSource::Local };
    let stopped_with_adb = other_source.locate(&name).is_none() && source.sdk().is_some_and(|sdk| {
        let adb = android_tool(&sdk, "platform-tools", "adb", "exe");
        adb_serial(&adb, &name).is_some_and(|serial| {
            crate::new_command!(&adb).args(["-s", &serial, "emu", "kill"]).output()
                .is_ok_and(|output| output.status.success() && !String::from_utf8_lossy(&output.stdout).contains("KO:"))
        })
    });
    if !stopped_with_adb {
        let mut running = running_avds().lock().unwrap();
        if let Some(avd) = running.get_mut(&id).filter(|avd| avd.pid == pid) {
            if !stop_emulator_process(pid) {
                avd.stop_requested = false;
                return CommandResult { ok: false, error: Some("Could not stop this emulator process".into()), output: None };
            }
        }
    }
    emit_log(&window, "log_avd_stop_sent", "info", json!({ "name": name }));
    CommandResult { ok: true, error: None, output: None }
}

fn stop_emulator_process(pid: u32) -> bool {
    let pid = pid.to_string();
    #[cfg(windows)]
    let output = crate::new_command!("taskkill").args(["/PID", &pid, "/T", "/F"]).output();
    #[cfg(not(windows))]
    let output = std::process::Command::new("kill").args(["-TERM", &pid]).output();
    output.is_ok_and(|result| result.status.success())
}

fn adb_serial(adb: &Path, name: &str) -> Option<String> {
    let devices = crate::new_command!(adb).arg("devices").output().ok()?;
    if !devices.status.success() { return None; }
    let devices = String::from_utf8_lossy(&devices.stdout);
    let mut matches = devices.lines().filter_map(|line| {
        let (serial, state) = line.split_once('\t')?;
        if !serial.starts_with("emulator-") || state.trim() != "device" { return None; }
        let result = crate::new_command!(adb).args(["-s", serial, "emu", "avd", "name"]).output().ok()?;
        (result.status.success() && String::from_utf8_lossy(&result.stdout).lines().next() == Some(name))
            .then(|| serial.to_string())
    });
    let first = matches.next()?;
    matches.next().is_none().then_some(first)
}

// ─── Optimize Guest Apps ──────────────────────────────────────────────────────
#[tauri::command]
pub async fn optimize_guest_apps(window: Window) -> CommandResult {
    let running = super::avd::list_avds().into_iter().filter(|avd| avd.running).collect::<Vec<_>>();
    let [avd] = running.as_slice() else {
        return CommandResult { ok: false, error: Some("Run exactly one AVD in KB to optimize apps".into()), output: None };
    };
    let Some(sdk) = avd.source.sdk() else {
        return CommandResult { ok: false, error: Some("Android SDK not found".into()), output: None };
    };
    let adb_exe = android_tool(&sdk, "platform-tools", "adb", "exe");
    let other_source = if avd.source == AvdSource::Local { AvdSource::System } else { AvdSource::Local };
    let serial = (other_source.locate(&avd.name).is_none()).then(|| adb_serial(&adb_exe, &avd.name)).flatten();
    let Some(serial) = serial else {
        return CommandResult { ok: false, error: Some("Could not identify this AVD in adb".into()), output: None };
    };

    emit_log(&window, "log_apps_scanning", "info", json!({}));

    let output = match std::process::Command::new(&adb_exe)
        .args(["-s", &serial, "shell", "pm", "list", "packages", "-3"])
        .output() {
            Ok(o) => o,
            Err(e) => return CommandResult { ok: false, error: Some(format!("Failed to run adb: {}", e)), output: None },
        };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut packages = vec![];
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("package:") {
            let pkg = trimmed.replacen("package:", "", 1);
            if !pkg.is_empty() {
                packages.push(pkg);
            }
        }
    }

    if packages.is_empty() {
        emit_log(&window, "log_apps_empty", "info", json!({}));
        return CommandResult { ok: true, error: None, output: Some("No third-party apps found".into()) };
    }

    let total = packages.len();
    emit_log(&window, "log_apps_compiling", "info", json!({ "total": total }));

    for (idx, pkg) in packages.iter().enumerate() {
        emit_log(&window, "log_app_compiling", "info", json!({ "index": idx + 1, "total": total, "package": pkg }));
        
        let _ = std::process::Command::new(&adb_exe)
            .args(["-s", &serial, "shell", "cmd", "package", "compile", "-m", "speed", "-f", pkg])
            .output();
    }

    emit_log(&window, "log_apps_compiled", "success", json!({}));
    CommandResult { ok: true, error: None, output: Some("Optimization completed successfully".into()) }
}
