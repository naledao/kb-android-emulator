import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  BatteryMedium,
  BluetoothOff,
  CameraOff,
  ChevronDown,
  ChevronUp,
  Cpu,
  Gamepad2,
  Gauge,
  HardDrive,
  MapPinOff,
  MonitorCog,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react'
import { Spinner } from './UI.jsx'
import * as api from '../api.js'

export function GpuSettings({ toast, gpus, hypervisor, sysInfo, loading, onRescan }) {
  const { t } = useTranslation()
  const [selectedGpu, setSelectedGpu] = useState(() => {
    if (!gpus || gpus.length === 0) return null;
    const dGpu = gpus.find(x => x.is_dedicated);
    return dGpu ? dGpu.index : gpus[0].index;
  });
  const [preference, setPreference] = useState(2)
  const [applying, setApplying] = useState(false)
  const [enablingWhpx, setEnablingWhpx] = useState(false)

  // Whether the Advanced Options panel is expanded
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // Load custom emulator launch preferences from localStorage
  const [selectedAccel, setSelectedAccel] = useState(
    localStorage.getItem('emulator_accel') || 'whpx'
  )
  const [selectedGpuMode, setSelectedGpuMode] = useState(
    localStorage.getItem('emulator_gpu') || 'host'
  )
  const [quickBoot, setQuickBoot] = useState(
    localStorage.getItem('emulator_quick_boot') === 'true'
  )
  const [bootAnim, setBootAnim] = useState(
    localStorage.getItem('emulator_boot_anim') !== 'false'
  )

  // Performance Tweaks State
  const [noCamera, setNoCamera] = useState(
    localStorage.getItem('emulator_perf_no_camera') === 'true'
  )
  const [noGps, setNoGps] = useState(
    localStorage.getItem('emulator_perf_no_gps') === 'true'
  )
  const [noBluetooth, setNoBluetooth] = useState(
    localStorage.getItem('emulator_perf_no_bluetooth') === 'true'
  )

  const handlePerfToggle = (key, currentVal, setter, label) => {
    const val = !currentVal
    setter(val)
    localStorage.setItem(key, String(val))
    toast(t(val ? 'gpu_perf_disabled' : 'gpu_perf_enabled', { feature: label }), 'success')
  }

  const handleQuickBootToggle = () => {
    const val = !quickBoot
    setQuickBoot(val)
    localStorage.setItem('emulator_quick_boot', String(val))
    toast(val ? t('gpu_quick_boot_enabled') : t('gpu_cold_boot_enabled'), 'success')
  }

  const handleBootAnimToggle = () => {
    const val = !bootAnim
    setBootAnim(val)
    localStorage.setItem('emulator_boot_anim', String(val))
    toast(val ? t('gpu_boot_animation_enabled') : t('gpu_boot_animation_disabled'), 'success')
  }

  useEffect(() => {
    if (selectedGpu === null && gpus && gpus.length > 0) {
      const dGpu = gpus.find(x => x.is_dedicated)
      setSelectedGpu(dGpu ? dGpu.index : gpus[0].index)
    }
  }, [gpus])

  const applyGpuPreference = async () => {
    if (selectedGpu === null) return
    setApplying(true)
    const result = await api.setGpuPreference({ gpuIndex: selectedGpu, gpuPreference: preference })
    setApplying(false)
    const ok = result?.ok ?? false
    toast(ok
      ? t('gpu_preference_applied')
      : t('gpu_preference_failed', { error: result?.error || t('gpu_registry_admin_required') }),
      ok ? 'success' : 'warn')
  }

  const enableWhpx = async () => {
    setEnablingWhpx(true)
    const result = await api.enableWhpx()
    setEnablingWhpx(false)
    toast(result.ok
      ? t('gpu_whpx_enabled')
      : t('gpu_whpx_failed'),
      result.ok ? 'success' : 'error')
  }

  const handleAccelChange = (val) => {
    setSelectedAccel(val)
    localStorage.setItem('emulator_accel', val)
    toast(t('gpu_accel_changed', { value: val.toUpperCase() }), 'success')
  }

  const handleGpuModeChange = (val) => {
    setSelectedGpuMode(val)
    localStorage.setItem('emulator_gpu', val)
    toast(t('gpu_render_changed', { value: val.toUpperCase() }), 'success')
  }

  if (loading || !sysInfo) return (
    <div className="loading-center-state">
      <Spinner size={24} />
      <span className="text-muted">{t('gpu_scanning')}</span>
    </div>
  )

  const GPU_PREFS = [
    { val: 1, label: t('gpu_preference_eco'), desc: t('gpu_preference_eco_description') },
    { val: 2, label: t('gpu_preference_fast'), desc: t('gpu_preference_fast_description') },
    { val: 0, label: t('gpu_preference_default'), desc: t('gpu_preference_default_description') },
  ]

  const ACCEL_OPTIONS = [
    { val: 'whpx', label: t('gpu_accel_whpx'), desc: t('gpu_accel_whpx_description') },
    { val: 'aehd', label: t('gpu_accel_aehd'), desc: t('gpu_accel_aehd_description') },
    { val: 'haxm', label: t('gpu_accel_haxm'), desc: t('gpu_accel_haxm_description') },
    { val: 'off', label: t('gpu_accel_off'), desc: t('gpu_accel_off_description') },
  ]

  const GPU_MODES = [
    { val: 'host', label: t('gpu_render_host'), desc: t('gpu_render_host_description') },
    { val: 'angle_indirect', label: t('gpu_render_angle'), desc: t('gpu_render_angle_description') },
    { val: 'swiftshader_indirect', label: t('gpu_render_swiftshader'), desc: t('gpu_render_swiftshader_description') },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="flex items-center justify-between" style={{ paddingBottom: 4 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {t('gpu_scan_description')}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onRescan} disabled={loading} style={{ border: '1px solid var(--border)' }}>
          <RefreshCw size={12} style={{ marginRight: 6 }} /> {t('gpu_rescan')}
        </button>
      </div>

      {/* ── Hardware Summary Cards ── */}
      {sysInfo && (
        <div className="grid-3">
          {[
            { icon: <Cpu size={16} />, label: 'CPU', val: sysInfo.cpu_model?.split('@')[0]?.trim(), sub: t('gpu_threads', { count: sysInfo.cpu_count }) },
            { icon: <HardDrive size={16} />, label: t('gpu_total_ram'), val: `${Math.round(sysInfo.total_ram / 1024)} GB`, sub: t('gpu_free_ram', { size: Math.round(sysInfo.free_ram / 1024) }) },
            { icon: <MonitorCog size={16} />, label: t('gpu_architecture'), val: sysInfo.arch, sub: sysInfo.platform },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-icon" style={{ background: 'rgba(120,80,255,0.15)' }}>{s.icon}</div>
              <div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{ fontSize: 14 }}>{s.val}</div>
                <div className="stat-sub">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Virtualization Accelerator ── */}
      <div className="card">
        <div className="card-title"><Zap size={14} style={{ marginRight: 6 }} /> {t('gpu_accel_title')}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          {t('gpu_accel_description')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ACCEL_OPTIONS.map(opt => (
            <label key={opt.val} className={`gpu-card ${selectedAccel === opt.val ? 'selected' : ''}`} style={{ cursor: 'pointer' }}>
              <input type="radio" name="accel" checked={selectedAccel === opt.val} onChange={() => handleAccelChange(opt.val)} style={{ accentColor: '#7c3aed' }} />
              <div>
                <div className="gpu-name">{opt.label}</div>
                <div className="gpu-vram">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>

        {selectedAccel === 'whpx' && !hypervisor?.whpx_enabled && (
          <div className="alert alert-warn mt-3" style={{ display: 'flex', justifyContent: 'between', alignItems: 'center' }}>
            <span><AlertTriangle size={14} style={{ marginRight: 6 }} /> {t('gpu_whpx_disabled')}</span>
            <button className="btn btn-primary btn-sm" onClick={enableWhpx} disabled={enablingWhpx}>
              {enablingWhpx ? t('gpu_whpx_enabling') : t('gpu_whpx_enable')}
            </button>
          </div>
        )}
      </div>

      {/* ── GPU Launch Rendering Mode ── */}
      <div className="card">
        <div className="card-title"><Gamepad2 size={14} style={{ marginRight: 6 }} /> {t('gpu_render_title')}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          {t('gpu_render_description')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {GPU_MODES.map(opt => (
            <label key={opt.val} className={`gpu-card ${selectedGpuMode === opt.val ? 'selected' : ''}`} style={{ cursor: 'pointer' }}>
              <input type="radio" name="gpu_mode" checked={selectedGpuMode === opt.val} onChange={() => handleGpuModeChange(opt.val)} style={{ accentColor: '#7c3aed' }} />
              <div>
                <div className="gpu-name">{opt.label}</div>
                <div className="gpu-vram">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* ── Launch & Boot Options ── */}
      <div className="card">
        <div className="card-title"><Rocket size={14} style={{ marginRight: 6 }} /> {t('gpu_boot_title')}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          {t('gpu_boot_description')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="flex items-center justify-between" style={{ padding: '4px 0' }}>
            <div style={{ flex: 1, paddingRight: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}><Zap size={13} style={{ marginRight: 6 }} /> {t('device_quick_boot')}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('gpu_quick_boot_description')}</div>
            </div>
            <div className={`toggle ${quickBoot ? 'on' : ''}`} onClick={handleQuickBootToggle} />
          </div>

          <div className="divider" style={{ margin: '4px 0' }} />

          <div className="flex items-center justify-between" style={{ padding: '4px 0' }}>
            <div style={{ flex: 1, paddingRight: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}><Rocket size={13} style={{ marginRight: 6 }} /> {t('device_boot_animation')}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('device_boot_animation_description')}</div>
            </div>
            <div className={`toggle ${bootAnim ? 'on' : ''}`} onClick={handleBootAnimToggle} />
          </div>
        </div>
      </div>

      {/* ── Advanced Options (collapsible) ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header / toggle */}
        <button
          id="btn-advanced-options-toggle"
          onClick={() => setAdvancedOpen(o => !o)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            fontWeight: 600,
            fontSize: 14,
            textAlign: 'left',
          }}
        >
          <span><Wrench size={14} style={{ marginRight: 6 }} /> {t('gpu_advanced')}</span>
          <span style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            background: 'rgba(120,80,255,0.12)',
            padding: '3px 10px',
            borderRadius: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            {advancedOpen ? t('gpu_collapse') : t('gpu_expand')}
          </span>
        </button>

        {advancedOpen && (
          <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Speed & Performance Tweaks */}
            <div>
              <div className="card-title" style={{ marginBottom: 8 }}><Gauge size={14} style={{ marginRight: 6 }} /> {t('gpu_tweaks_title')}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                {t('gpu_tweaks_description')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="flex items-center justify-between" style={{ padding: '4px 0' }}>
                  <div style={{ flex: 1, paddingRight: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}><CameraOff size={13} style={{ marginRight: 6 }} /> {t('gpu_disable_camera')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('gpu_camera_description')}</div>
                  </div>
                  <div className={`toggle ${noCamera ? 'on' : ''}`} onClick={() => handlePerfToggle('emulator_perf_no_camera', noCamera, setNoCamera, t('gpu_camera'))} />
                </div>

                <div className="divider" style={{ margin: '4px 0' }} />

                <div className="flex items-center justify-between" style={{ padding: '4px 0' }}>
                  <div style={{ flex: 1, paddingRight: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}><MapPinOff size={13} style={{ marginRight: 6 }} /> {t('gpu_disable_gps')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('gpu_gps_description')}</div>
                  </div>
                  <div className={`toggle ${noGps ? 'on' : ''}`} onClick={() => handlePerfToggle('emulator_perf_no_gps', noGps, setNoGps, t('gpu_gps'))} />
                </div>

                <div className="divider" style={{ margin: '4px 0' }} />

                <div className="flex items-center justify-between" style={{ padding: '4px 0' }}>
                  <div style={{ flex: 1, paddingRight: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}><BluetoothOff size={13} style={{ marginRight: 6 }} /> {t('gpu_disable_bluetooth')}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('gpu_bluetooth_description')}</div>
                  </div>
                  <div className={`toggle ${noBluetooth ? 'on' : ''}`} onClick={() => handlePerfToggle('emulator_perf_no_bluetooth', noBluetooth, setNoBluetooth, t('gpu_bluetooth'))} />
                </div>
              </div>
            </div>

            <div className="divider" />

            {/* Windows GPU Preference (Registry) */}
            <div>
              <div className="card-title" style={{ marginBottom: 8 }}><ShieldCheck size={14} style={{ marginRight: 6 }} /> {t('gpu_registry_title')}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                {t('gpu_registry_description')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {gpus.length === 0 && <div className="alert alert-warn">{t('gpu_no_devices')}</div>}
                {gpus.map(gpu => (
                  <div key={gpu.index} className={`gpu-card ${selectedGpu === gpu.index ? 'selected' : ''}`}
                    onClick={() => setSelectedGpu(gpu.index)}>
                    <div className={`gpu-icon ${gpu.is_dedicated ? 'dedicated' : 'integrated'}`}>
                      {gpu.is_dedicated ? <Zap size={14} /> : <Sparkles size={14} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="gpu-name">{gpu.name}</div>
                      <div className="gpu-vram">{t('gpu_vram', { size: gpu.vram })} · {gpu.is_dedicated ? t('gpu_dedicated') : t('gpu_integrated')}</div>
                    </div>
                    {gpu.is_dedicated && <span className="badge badge-gpu">{t('gpu_recommended')}</span>}
                    {selectedGpu === gpu.index && <span style={{ color: '#7c3aed', fontSize: 18 }}>✓</span>}
                  </div>
                ))}
              </div>

              <div className="form-group" style={{ marginBottom: 20 }}>
                <label className="form-label">{t('gpu_registry_mode')}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {GPU_PREFS.map(p => (
                    <label key={p.val} className="gpu-card" style={{ cursor: 'pointer' }}>
                      <input type="radio" name="win_gpu_pref" checked={preference === p.val} onChange={() => setPreference(p.val)} style={{ accentColor: '#7c3aed' }} />
                      <div>
                        <div className="gpu-name">{p.label}</div>
                        <div className="gpu-vram">{p.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="alert alert-info" style={{ marginBottom: 16 }}>
                <Sparkles size={14} style={{ marginRight: 6 }} /> {t('gpu_registry_path', { path: 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences' })}
              </div>

              <button className="btn btn-primary" onClick={applyGpuPreference} disabled={applying || selectedGpu === null}>
                {applying ? <><Spinner size={15} />{t('gpu_registry_applying')}</> : <><ShieldCheck size={14} style={{ marginRight: 6 }} /> {t('gpu_registry_apply')}</>}
              </button>
            </div>

            <div className="divider" />

            {/* Performance Tips */}
            <div>
              <div className="card-title" style={{ marginBottom: 12 }}><Rocket size={14} style={{ marginRight: 6 }} /> {t('gpu_tips_title')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { icon: <Gamepad2 size={16} />, tip: t('gpu_tip_host') },
                  { icon: <MonitorCog size={16} />, tip: t('gpu_tip_x86') },
                  { icon: <Cpu size={16} />, tip: t('gpu_tip_resources') },
                  { icon: <Zap size={16} />, tip: t('gpu_tip_whpx') },
                  { icon: <Rocket size={16} />, tip: t('gpu_tip_snapshot') },
                  { icon: <BatteryMedium size={16} />, tip: t('gpu_tip_close_apps') },
                ].map((t, i) => (
                  <div key={i} className="flex gap-2 items-center" style={{ padding: '10px 0', borderBottom: i < 5 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ width: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{t.icon}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{t.tip}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
