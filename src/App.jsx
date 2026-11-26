import { useState, useEffect, useCallback } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useToast, ToastContainer, ConsoleLog, Spinner, ProgressBar, useConfirm } from './components/UI.jsx'
import { DeviceCard, CreateAvdDialog, EditAvdDialog } from './components/Devices.jsx'
import { SdkManager } from './components/SdkManager.jsx'
import { GpuSettings } from './components/GpuSettings.jsx'
import { Settings } from './components/Settings.jsx'
import * as api from './api.js'
import { useTranslation } from 'react-i18next'
import i18n from './i18n.js'
import {
  Sliders,
  Package,
  Smartphone,
  Cpu,
  Terminal,
  Settings as SettingsIcon,
  RefreshCw,
  Zap,
  Plus,
  AlertTriangle,
  Coffee,
  Wrench,
  Bot,
  Play,
  Pause,
  CheckCircle2,
  Trash2,
  Download,
  Info,
  Minus,
  Square,
  X
} from 'lucide-react'
import './index.css'

export default function App() {
  const { toasts, toast } = useToast()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [page, setPage] = useState('setup')
  const [logs, setLogs] = useState([])
  const [emulatorLogs, setEmulatorLogs] = useState({})

  const { t } = useTranslation()

  const NAV = [
    { id: 'setup', icon: <Sliders size={14} />, label: t('nav_setup') },
    { id: 'sdk', icon: <Package size={14} />, label: t('nav_sdk') },
    { id: 'devices', icon: <Smartphone size={14} />, label: t('nav_devices') },
    { id: 'gpu', icon: <Cpu size={14} />, label: t('nav_gpu') },
    { id: 'logs', icon: <Terminal size={14} />, label: t('nav_logs') },
    { id: 'settings', icon: <SettingsIcon size={14} />, label: t('nav_settings') },
  ]
  const [logCapture, setLogCapture] = useState(
    localStorage.getItem('emulator_log_capture') !== 'false'
  )
  const [avds, setAvds] = useState([])
  const [appVersion, setAppVersion] = useState('0.1.0-beta')

  useEffect(() => {
    api.getAppVersion().then(setAppVersion).catch(e => console.error(e))
  }, [])

  const [showCreate, setShowCreate] = useState(false)
  const [editingAvd, setEditingAvd] = useState(null)
  const [status, setStatus] = useState(null)
  const [progress, setProgress] = useState({})
  const [installing, setInstalling] = useState({})
  const [uninstalling, setUninstalling] = useState({})
  const [sdkProgress, setSdkProgress] = useState({})
  const [sdkInstalling, setSdkInstalling] = useState({})
  const [sdkErrors, setSdkErrors] = useState({})
  const [gpus, setGpus] = useState([])
  const [hypervisor, setHypervisor] = useState(null)
  const [sysInfo, setSysInfo] = useState(null)
  const [loadingHardware, setLoadingHardware] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

  // ── Track window maximized state ────────────────────────────────────────────
  useEffect(() => {
    const win = getCurrentWindow()
    win.isMaximized().then(setIsMaximized)
    let unlisten
    win.onResized(async () => {
      setIsMaximized(await win.isMaximized())
    }).then(u => { unlisten = u })
    return () => { if (unlisten) unlisten() }
  }, [])

  // ── Listen to Tauri backend events ─────────────────────────────────────────
  useEffect(() => {
    const offLog = api.on('log', (line) => {
      setLogs(l => [...l.slice(-500), line])
    })
    const offProgress = api.on('progress', (data) => {
      setProgress(p => ({ ...p, [data.task]: data.pct }))
      setSdkProgress(p => ({ ...p, [data.task]: data.pct }))
    })
    const offEmulatorLog = api.on('emulator-log', ({ name, line }) => {
      // Only store if capture is enabled — read from localStorage for latest value
      if (localStorage.getItem('emulator_log_capture') === 'false') return
      setEmulatorLogs(prev => ({
        ...prev,
        [name]: [...(prev[name] || []).slice(-300), line.trim()]
      }))
    })
    const offEmulatorExit = api.on('emulator-exit', ({ name }) => {
      toast(i18n.t('emulator_exited', { name }), 'info')
      refreshAvds()
    })
    return () => { offLog?.(); offProgress?.(); offEmulatorLog?.(); offEmulatorExit?.() }
  }, [])

  // ── Load status & devices on mount & poll running state ─────────────────────
  useEffect(() => {
    refreshStatus()
    refreshAvds()

    const timer = setInterval(refreshAvds, 3000)
    return () => clearInterval(timer)
  }, [])

  // Trigger hardware detection on-demand when user opens creation/editing modals
  useEffect(() => {
    if ((showCreate || editingAvd) && !sysInfo) {
      refreshHardware()
    }
  }, [showCreate, editingAvd, sysInfo])

  const refreshHardware = async () => {
    setLoadingHardware(true)
    try {
      const [g, h, s] = await Promise.all([
        api.detectGpus(),
        api.checkHypervisor(),
        api.getSystemInfo()
      ])
      setGpus(g)
      setHypervisor(h)
      setSysInfo(s)
    } catch (e) {
      console.error("Failed to detect hardware:", e)
    }
    setLoadingHardware(false)
  }

  const refreshStatus = async () => {
    const s = await api.checkInstallStatus()
    setStatus(s)
  }

  const refreshAvds = async () => {
    const list = await api.listAvds()
    setAvds(Array.isArray(list) ? list : [])
  }

  const handleLaunch = async (name, wipeData = false) => {
    const avd = avds.find(a => a.name === name)
    const accel = localStorage.getItem('emulator_accel') || 'whpx'
    const gpuMode = avd?.gpu || localStorage.getItem('emulator_gpu') || 'host'
    let quickBootVal = localStorage.getItem(`emulator_quick_boot_${name}`)
    if (quickBootVal === null) {
      quickBootVal = localStorage.getItem('emulator_quick_boot')
    }
    const quickBoot = quickBootVal === 'true'

    let bootAnimVal = localStorage.getItem(`emulator_boot_anim_${name}`)
    if (bootAnimVal === null) {
      bootAnimVal = localStorage.getItem('emulator_boot_anim')
    }
    const bootAnim = bootAnimVal !== 'false'

    const noCamera = localStorage.getItem('emulator_perf_no_camera') === 'true'
    const noGps = localStorage.getItem('emulator_perf_no_gps') === 'true'
    const noBluetooth = localStorage.getItem('emulator_perf_no_bluetooth') === 'true'

    const readOnly = localStorage.getItem(`emulator_ultra_gaming_${name}`) === 'true'

    let speedModeVal = localStorage.getItem(`emulator_speed_mode_${name}`)
    if (speedModeVal === null) {
      speedModeVal = localStorage.getItem('emulator_speed_mode')
    }
    const speedMode = speedModeVal !== 'false'

    const rawLaunch = localStorage.getItem(`emulator_raw_launch_${name}`) === 'true'

    const result = await api.launchAvd({
      name,
      gpuMode,
      accel,
      quickBoot,
      bootAnim,
      noCamera,
      noGps,
      noBluetooth,
      readOnly,
      wipeData,
      speedMode,
      rawLaunch,
    })
    if (result.ok) {
      toast(t('emulator_launching', { name }), 'info')
      setTimeout(refreshAvds, 500)
    } else {
      toast(t('emulator_launch_failed', { error: result.error ?? t('unknown_error') }), 'error')
    }
  }

  const handleStop = async (name) => {
    const result = await api.stopAvd({ name })
    if (result.ok) {
      toast(t('emulator_stopped', { name }), 'info')
      setTimeout(refreshAvds, 500)
    }
  }

  const handleDelete = async (name) => {
    const result = await api.deleteAvd({ name })
    if (result.ok) {
      toast(t('device_deleted', { name }), 'success')
      refreshAvds()
    }
  }

  const handleOptimizeApps = async () => {
    setOptimizing(true)
    toast(t('optimization_started'), 'info')
    try {
      const r = await api.optimizeGuestApps()
      if (r.ok) {
        toast(t('optimization_complete'), 'success')
      } else {
        toast(t('optimization_failed', { error: r.error || t('optimization_running_required') }), 'error')
      }
    } catch (e) {
      toast(t('optimization_error', { error: String(e) }), 'error')
    }
    setOptimizing(false)
  }

  const installJdk = async () => {
    setInstalling(s => ({ ...s, jdk: true }))
    const r = await api.installJdk()
    setInstalling(s => ({ ...s, jdk: false }))
    if (r.ok) {
      toast(t('setup_jdk_installed'), 'success')
    } else if (r.error && r.error.includes('cancelled')) {
      toast(t('download_cancelled'), 'warn')
    } else {
      toast(t('setup_jdk_failed', { error: r.error ?? t('unknown_error') }), 'error')
    }
    refreshStatus()
  }

  const installCmdline = async () => {
    setInstalling(s => ({ ...s, cmdline: true }))
    const r = await api.installCmdlineTools()
    setInstalling(s => ({ ...s, cmdline: false }))
    if (r.ok) {
      toast(t('setup_cmdline_installed'), 'success')
    } else if (r.error && r.error.includes('cancelled')) {
      toast(t('download_cancelled'), 'warn')
    } else {
      toast(t('setup_cmdline_failed', { error: r.error ?? t('unknown_error') }), 'error')
    }
    refreshStatus()
  }

  const handleCancelDownload = async (key) => {
    await api.cancelDownload()
    // No toast here — the install handler already emits one when it catches the cancelled error
  }

  const uninstallJdk = async () => {
    if (!await confirm(t('setup_uninstall_jdk_confirm'))) return
    setUninstalling(s => ({ ...s, jdk: true }))
    const r = await api.uninstallJdk()
    setUninstalling(s => ({ ...s, jdk: false }))
    if (r.ok) {
      toast(t('setup_uninstall_jdk_success'), 'success')
    } else {
      toast(t('setup_uninstall_jdk_failed', { error: r.error ?? t('unknown_error') }), 'error')
    }
    refreshStatus()
  }

  const uninstallCmdline = async () => {
    if (!await confirm(t('setup_uninstall_cmdline_confirm'))) return
    setUninstalling(s => ({ ...s, cmdline: true }))
    const r = await api.uninstallCmdlineTools()
    setUninstalling(s => ({ ...s, cmdline: false }))
    if (r.ok) {
      toast(t('setup_uninstall_cmdline_success'), 'success')
    } else {
      toast(t('setup_uninstall_cmdline_failed', { error: r.error ?? t('unknown_error') }), 'error')
    }
    refreshStatus()
  }

  const allReady = status?.jdk_installed && status?.cmdline_installed && status?.emulator_installed

  const StatusDot = ({ ok }) => (
    <span className={`badge ${ok ? 'badge-ok' : 'badge-warn'}`}>
      {ok ? (
        <span className="flex items-center gap-1">
          <CheckCircle2 size={10} />
          {t('installed')}
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <AlertTriangle size={10} />
          {t('not_installed')}
        </span>
      )}
    </span>
  )

  return (
    <div className="app-shell">
      {/* ── Title Bar ── */}
      <div className="titlebar" data-tauri-drag-region>
        <div className="titlebar-logo">
          <img src="/icon.png" alt={t('app_logo')} style={{ width: '20px', height: '20px', borderRadius: '4px', objectFit: 'contain' }} />
          <span className="app-name" style={{ marginLeft: '8px' }}>{t('app_name')}</span>
          <span style={{ fontSize: '9px', opacity: 0.5, marginLeft: '6px', background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.5px' }}>
            v{appVersion}
          </span>
        </div>
        <div className="titlebar-spacer" />

        {status && (
          <div className="flex gap-2 items-center" style={{ fontSize: 11, WebkitAppRegion: 'no-drag' }}>
            {allReady
              ? <span className="badge badge-ok flex items-center gap-1"><CheckCircle2 size={10} /> {t('ready')}</span>
              : <span className="badge badge-warn flex items-center gap-1"><AlertTriangle size={10} /> {t('setup_required')}</span>
            }
            {avds.filter(a => a.running).length > 0 && (
              <span className="badge badge-running flex items-center gap-1">
                <span className="dot" />
                {t('devices_active_count', { count: avds.filter(a => a.running).length })}
              </span>
            )}
            {/* Log capture quick-toggle — always accessible from any page */}
            <span
              id="btn-log-capture-toggle"
              className={`badge ${logCapture ? 'badge-ok' : 'badge-warn'} flex items-center gap-1 has-tooltip`}
              onClick={() => {
                const next = !logCapture
                setLogCapture(next)
                localStorage.setItem('emulator_log_capture', String(next))
                toast(next ? t('logs_capture_on') : t('logs_capture_off'), 'info')
              }}
              data-tooltip={t(logCapture ? 'logs_capture_pause' : 'logs_capture_resume')}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              {logCapture ? <span className="flex items-center gap-1"><Play size={10} />{t('logs_on')}</span> : <span className="flex items-center gap-1"><Pause size={10} />{t('logs_off')}</span>}
            </span>
          </div>
        )}

        <div className="titlebar-controls">
          <button className="titlebar-btn titlebar-btn-min" onClick={() => api.minimizeWindow()} title={t('window_minimize')} aria-label={t('window_minimize_label')}>
            <span style={{ fontSize: 14, lineHeight: 1, display: 'block', marginTop: '-2px' }}>&#x2500;</span>
          </button>
          <button
            className="titlebar-btn titlebar-btn-max"
            onClick={() => api.maximizeWindow()}
            title={isMaximized ? t('window_restore') : t('window_maximize')}
            aria-label={isMaximized ? t('window_restore_label') : t('window_maximize_label')}
          >
            {isMaximized ? (
              /* Restore icon: two overlapping rounded squares */
              <span style={{ position: 'relative', width: 13, height: 13, display: 'block' }}>
                {/* back square */}
                <span style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: 9, height: 9,
                  border: '1.5px solid currentColor',
                  borderRadius: 2,
                  display: 'block',
                  background: 'transparent',
                }} />
                {/* front square (top-left offset) */}
                <span style={{
                  position: 'absolute', top: 0, left: 0,
                  width: 9, height: 9,
                  border: '1.5px solid currentColor',
                  borderRadius: 2,
                  display: 'block',
                  background: 'var(--bg-void)',
                  borderBottom: '1.5px solid currentColor',
                }} />
              </span>
            ) : (
              /* Maximize icon: single rounded square */
              <span style={{
                fontSize: 11, lineHeight: 1, display: 'block',
                border: '1.5px solid currentColor',
                width: 11, height: 11,
                borderRadius: 2,
              }} />
            )}
          </button>
          <button className="titlebar-btn titlebar-btn-close" onClick={() => api.closeWindow()} title={t('window_close')} aria-label={t('window_close_label')}>
            <span style={{ fontSize: 16, lineHeight: 1, display: 'block' }}>&#x2715;</span>
          </button>
        </div>
      </div>

      <div className="body-split">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-section-label">{t('nav_label')}</div>
          {NAV.map(n => (
            <div key={n.id}
              className={`sidebar-item ${page === n.id ? 'active' : ''}`}
              onClick={() => {
                setPage(n.id)
                if (n.id === 'gpu' && !sysInfo) {
                  refreshHardware()
                }
              }}
              id={`nav-${n.id}`}
            >
              <span className="icon">{n.icon}</span>
              <span>{n.label}</span>
            </div>
          ))}
          <div className="sidebar-footer">
            <a href="https://github.com/kil0bit-kb/kb-android-emulator" target="_blank" rel="noopener noreferrer" className='text-muted text-sm'>{t('app_name')}</a><br />
            <span className="text-muted" style={{ fontSize: 10 }}>{t('app_powered_by')}</span>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="main-content">

          {/* ─── Devices Page ─── */}
          {page === 'devices' && (
            <div className="page">
              <div className="page-header flex items-center justify-between">
                <div>
                  <h1 className="page-title flex items-center gap-2">
                    <Smartphone size={20} />
                    {t('devices_title')}
                  </h1>
                  <p className="page-subtitle">{t('devices_subtitle')}</p>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost btn-sm flex items-center gap-1" onClick={refreshAvds}>
                    <RefreshCw size={12} />
                    {t('devices_refresh')}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm flex items-center gap-1"
                    onClick={handleOptimizeApps}
                    disabled={optimizing || avds.filter(a => a.running).length === 0}
                    title={t('devices_optimize_tooltip')}
                  >
                    <Zap size={12} />
                    {optimizing ? t('devices_optimizing') : t('devices_optimize')}
                  </button>
                  <button className="btn btn-primary flex items-center gap-1" onClick={() => setShowCreate(true)}
                    disabled={!allReady} id="btn-create-device">
                    <Plus size={12} />
                    {t('devices_new')}
                  </button>
                </div>
              </div>

              {!allReady && (
                <div className="alert alert-warn flex items-center gap-2" style={{ marginBottom: 20 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                  <span>{t('devices_setup_required')}</span>
                </div>
              )}

              {avds.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon"><Smartphone size={40} style={{ opacity: 0.25 }} /></div>
                  <div className="empty-title">{t('devices_empty_title')}</div>
                  <div className="empty-desc">
                    {t('devices_empty_desc')}
                  </div>
                  <button className="btn btn-primary flex items-center gap-1" onClick={() => setShowCreate(true)} disabled={!allReady}>
                    <Plus size={12} />
                    {t('devices_create_first')}
                  </button>
                </div>
              ) : (
                <div className="grid-auto">
                  {avds.map(avd => (
                    <DeviceCard key={avd.name} avd={avd}
                      onLaunch={handleLaunch}
                      onStop={handleStop}
                      onDelete={handleDelete}
                      onEdit={(target) => setEditingAvd(target)}
                      logs={emulatorLogs}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── SDK Manager Page ─── */}
          {page === 'sdk' && (
            <div className="page">
              <div className="page-header">
                <h1 className="page-title flex items-center gap-2">
                  <Package size={20} />
                  {t('sdk_title')}
                </h1>
                <p className="page-subtitle">{t('sdk_subtitle')}</p>
              </div>
              {status?.cmdline_installed
                ? <SdkManager
                  logs={logs}
                  status={status}
                  refreshStatus={refreshStatus}
                  progress={sdkProgress}
                  setProgress={setSdkProgress}
                  installing={sdkInstalling}
                  setInstalling={setSdkInstalling}
                  errors={sdkErrors}
                  setErrors={setSdkErrors}
                />
                : <div className="alert alert-warn flex items-center gap-2">
                  <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                  <span>{t('sdk_cmdline_required')}</span>
                </div>
              }
            </div>
          )}

          {/* ─── GPU & Performance Page ─── */}
          {page === 'gpu' && (
            <div className="page">
              <div className="page-header">
                <h1 className="page-title flex items-center gap-2">
                  <Cpu size={20} />
                  {t('gpu_title')}
                </h1>
                <p className="page-subtitle">{t('gpu_subtitle')}</p>
              </div>
              <GpuSettings
                toast={toast}
                gpus={gpus}
                hypervisor={hypervisor}
                sysInfo={sysInfo}
                loading={loadingHardware}
                onRescan={refreshHardware}
              />
            </div>
          )}

          {/* ─── Setup / Install Page ─── */}
          {page === 'setup' && (
            <div className="page">
              <div className="page-header">
                <h1 className="page-title flex items-center gap-2">
                  <Sliders size={20} />
                  {t('setup_title')}
                </h1>
                <p className="page-subtitle">{t('setup_subtitle')}</p>
              </div>

              <div className="alert alert-info flex items-start gap-2" style={{ marginBottom: 24 }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{t('setup_warn')}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  {
                    step: 1, key: 'jdk', icon: <Coffee size={20} />,
                    title: t('setup_jdk_name'),
                    desc: t('setup_jdk_description'),
                    size: '~180 MB',
                    installed: status?.jdk_installed,
                    onInstall: installJdk,
                    onUninstall: uninstallJdk,
                    loading: installing.jdk,
                    uninstalling: uninstalling.jdk,
                    requires: false,
                  },
                  {
                    step: 2, key: 'cmdline', icon: <Wrench size={20} />,
                    title: t('setup_cmdline_name'),
                    desc: t('setup_cmdline_description'),
                    size: '~130 MB',
                    installed: status?.cmdline_installed,
                    onInstall: installCmdline,
                    onUninstall: uninstallCmdline,
                    loading: installing.cmdline,
                    uninstalling: uninstalling.cmdline,
                    requires: !status?.jdk_installed,
                  },
                  {
                    step: 3, key: 'emulator', icon: <Bot size={20} />,
                    title: t('setup_emulator_name'),
                    desc: t('setup_emulator_description'),
                    size: '~300 MB',
                    installed: status?.emulator_installed,
                    onInstall: null,
                    onUninstall: null,
                    loading: false,
                    uninstalling: false,
                    requires: false,
                  },
                ].map(item => (
                  <div key={item.key} className={`setup-card ${item.installed ? 'installed' : ''} ${item.requires ? 'locked' : ''}`}>
                    <div className="setup-card-main">
                      <div className="setup-card-icon-container">
                        <div className={`setup-card-icon ${item.installed ? 'installed' : 'pending'}`}>
                          {item.icon}
                        </div>
                        <div className="setup-card-badge">{t('setup_step', { step: item.step })}</div>
                      </div>

                      <div className="setup-card-content">
                        <div className="setup-card-header">
                          <h3 className="setup-card-title">{item.title}</h3>
                          <StatusDot ok={item.installed} />
                        </div>
                        <p className="setup-card-desc">{item.desc}</p>
                        <div className="setup-card-meta">
                          <span className="setup-meta-badge">
                            <Package size={11} />
                            {item.size}
                          </span>
                        </div>
                      </div>

                      <div className="setup-card-actions">
                        {item.onInstall && (
                          item.loading ? (
                            <button
                              className="btn-setup cancel has-tooltip"
                              onClick={() => handleCancelDownload(item.key)}
                              data-tooltip={t('setup_cancel_download')}
                            >
                              <X size={12} />{t('cancel')}
                            </button>
                          ) : item.uninstalling ? (
                            <button
                              className="btn-setup cancel"
                              disabled
                              style={{ opacity: 0.75, cursor: 'not-allowed' }}
                            >
                              <Spinner size={12} />{t('setup_uninstalling')}
                            </button>
                          ) : item.installed ? (
                            item.onUninstall && (
                              <button
                                className="btn-setup cancel has-tooltip"
                                onClick={item.onUninstall}
                                data-tooltip={t('setup_uninstall_component')}
                              >
                                <Trash2 size={12} /> {t('uninstall')}
                              </button>
                            )
                          ) : (
                            <button
                              className={`btn-setup ${item.installed ? 'installed' : 'primary'}`}
                              onClick={item.onInstall}
                              disabled={item.requires || item.installed}
                              id={`btn-install-${item.key}`}
                            >
                              {item.installed ? t('installed') : <><Download size={12} />{t('setup_install_now')}</>}
                            </button>
                          )
                        )}
                        {!item.onInstall && !item.installed && (
                          <button className="btn-setup secondary" onClick={() => setPage('sdk')}>
                            {t('setup_go_to_sdk')}
                          </button>
                        )}
                      </div>
                    </div>

                    {item.loading && progress[item.key] !== undefined && (
                      <div className="setup-card-progress">
                        <div className="progress-labels">
                          <span>{t('setup_downloading')}</span>
                          <span>{progress[item.key]}%</span>
                        </div>
                        <ProgressBar value={progress[item.key]} />
                      </div>
                    )}

                    {item.requires && (
                      <div className="setup-card-lock-msg">
                        <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                        <span>{t('setup_jdk_required', { step: item.step - 1 })}</span>
                      </div>
                    )}
                  </div>
                ))}

                {allReady && (
                  <div className="alert alert-success flex items-start gap-2">
                    <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{t('setup_complete')}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Settings Page ─── */}
          {page === 'settings' && (
            <Settings
              toast={toast}
            />
          )}

          {/* ─── Logs Page ─── */}
          {page === 'logs' && (
            <div className="page">
              <div className="page-header flex items-center justify-between">
                <div>
                  <h1 className="page-title flex items-center gap-2">
                    <Terminal size={20} />
                    {t('logs_title')}
                  </h1>
                  <p className="page-subtitle">{t('logs_subtitle')}</p>
                </div>
                <button className="btn btn-ghost btn-sm flex items-center gap-1" onClick={() => setLogs([])}>
                  <Trash2 size={12} />
                  {t('logs_clear')}
                </button>
              </div>
              <ConsoleLog lines={logs} />

              {/* ── Emulator Log Section ── */}
              <div className="divider" style={{ margin: '20px 0 12px' }} />
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <div className="section-title flex items-center gap-2" style={{ margin: 0 }}>
                  <Terminal size={14} />
                  {t('logs_capture_title')}
                </div>
                <div className="flex gap-2">
                  {Object.keys(emulatorLogs).length > 0 && (
                    <button
                      className="btn btn-ghost btn-sm flex items-center gap-1"
                      onClick={() => setEmulatorLogs({})}
                      title={t('logs_clear_all_tooltip')}
                    >
                      <Trash2 size={12} />
                      {t('logs_clear_emulator')}
                    </button>
                  )}
                  <button
                    id="btn-log-capture-toggle"
                    className={`btn btn-sm flex items-center gap-1 ${logCapture ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => {
                      const next = !logCapture
                      setLogCapture(next)
                      localStorage.setItem('emulator_log_capture', String(next))
                    }}
                    title={t(logCapture ? 'logs_capture_pause' : 'logs_capture_resume')}
                  >
                    {logCapture ? <span className="flex items-center gap-1"><Play size={12} />{t('logs_capturing')}</span> : <span className="flex items-center gap-1"><Pause size={12} />{t('logs_paused')}</span>}
                  </button>
                </div>
              </div>

              {!logCapture && (
                <div className="alert alert-warn flex items-center gap-2" style={{ marginBottom: 12, fontSize: 13 }}>
                  <Pause size={14} style={{ flexShrink: 0 }} />
                  <span>{t('logs_paused_warn')}</span>
                </div>
              )}

              {Object.keys(emulatorLogs).length > 0 ? (
                Object.entries(emulatorLogs).map(([name, lines]) => (
                  <div key={name} style={{ marginBottom: 16 }}>
                    <div className="card-title flex items-center gap-2" style={{ marginBottom: 8 }}>
                      <Smartphone size={14} />
                      {name}
                    </div>
                    <ConsoleLog lines={lines} />
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>
                  {logCapture ? t('logs_empty') : t('logs_capture_paused')}
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {/* ─── Create AVD Dialog ─── */}
      {showCreate && (
        <CreateAvdDialog
          gpus={gpus}
          logs={logs}
          status={status}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            toast(t('device_created'), 'success')
            refreshAvds()
          }}
        />
      )}
      {editingAvd && (
        <EditAvdDialog
          avd={editingAvd}
          gpus={gpus}
          onClose={() => setEditingAvd(null)}
          onSaved={() => {
            setEditingAvd(null)
            toast(t('device_updated'), 'success')
            refreshAvds()
          }}
        />
      )}
      <ToastContainer toasts={toasts} />
      {confirmDialog}
    </div>
  )
}
