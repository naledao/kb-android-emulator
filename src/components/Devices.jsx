import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Copy,
  Eye,
  EyeOff,
  Monitor,
  Pencil,
  Play,
  Save,
  Smartphone,
  Trash2,
  Wrench,
  Zap,
} from 'lucide-react'
import { Spinner, ConsoleLog, CustomSelect } from './UI.jsx'
import * as api from '../api.js'


const RESOLUTIONS = [
  // ── Portrait 9:16 ──────────────────────────────────────────
  '1080x1920',
  '720x1280',
  '1440x2560',
  '1080x2340',
  '1080x2400',
  '1440x3200',
  // ── Portrait Other ─────────────────────────────────────────
  '1170x2532',
  '828x1792',
  '1080x2160',
  '540x960',
  // ── Landscape ──────────────────────────────────────────────
  '1920x1080',
  '1280x720',
  '2560x1440',
  // ── Tablet / Wide ──────────────────────────────────────────
  '2560x1600',
  '1920x1200',
  '2048x1536',
  '1280x800',
  '800x1280',
  // ── Foldable / Tall ────────────────────────────────────────
  '884x2208',
  '1768x2208',
  // ── Square ─────────────────────────────────────────────────
  '1080x1080',
  // ── Free Size (Custom) ─────────────────────────────────────
  'custom',
]
const GPU_MODES = [
  { val: 'auto',     label: 'device_gpu_auto' },
  { val: 'host',     label: 'device_gpu_host' },
  { val: 'software', label: 'device_gpu_software' },
]

export function CreateAvdDialog({ onClose, onCreated, gpus, status }) {
  const { t } = useTranslation()
  const installedImages = (status?.installed_packages || []).filter(pkg => pkg.startsWith("system-images;"))

  const getAndroidVersion = (pkgId) => {
    const parts = pkgId.split(';')
    if (parts.length < 2) return 'Device'
    const apiLevel = parseInt(parts[1].replace('android-', ''))
    if (isNaN(apiLevel)) return 'Device'
    
    if (apiLevel === 32) return '12L'
    if (apiLevel >= 33) return String(apiLevel - 20)
    if (apiLevel >= 28) return String(apiLevel - 19)
    if (apiLevel >= 26) return '8'
    if (apiLevel >= 24) return '7'
    if (apiLevel >= 23) return '6'
    if (apiLevel >= 21) return '5'
    return `API_${apiLevel}`
  }

  const [randId] = useState(() => Math.floor(1000 + Math.random() * 9000))

  const [form, setForm] = useState(() => {
    const defaultGpu = 'auto';
    
    const initialImage = installedImages[0] || '';
    let initialName = `Device_${randId}`;
    if (initialImage) {
      const ver = getAndroidVersion(initialImage);
      initialName = `Android_${ver}_Device_${randId}`;
    }

    return {
      name: initialName,
      systemImage: initialImage,
      ram: 4096, cores: 4, storage: 8192,
      gpuMode: defaultGpu, screenResolution: '1080x1920', dpi: 420,
    }
  })
  const [creating, setCreating] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Custom free-size state for Create dialog
  const [customW, setCustomW] = useState('1080')
  const [customH, setCustomH] = useState('1920')

  const sysLower = form.systemImage.toLowerCase();
  const isSpecial = sysLower.includes('wear') || 
                    sysLower.includes('tv') || 
                    sysLower.includes('automotive') ||
                    sysLower.includes('google-tv');

  const handleSystemImageChange = (val) => {
    const apiLower = val.toLowerCase();
    const isWear = apiLower.includes('wear');
    const isTv = apiLower.includes('tv') || apiLower.includes('google-tv');
    const isAuto = apiLower.includes('automotive');

    setForm(f => {
      const parts = f.name.split('_')
      const isDefaultPattern = f.name.startsWith('Device_') || 
                               (f.name.startsWith('Android_') && f.name.includes('_Device_')) ||
                               (f.name.startsWith('Watch_') && f.name.includes('_Device_')) ||
                               (f.name.startsWith('TV_') && f.name.includes('_Device_')) ||
                               (f.name.startsWith('Car_') && f.name.includes('_Device_'));
      
      let newName = f.name;
      if (isDefaultPattern) {
        const rand = parts[parts.length - 1] || String(randId);
        const ver = getAndroidVersion(val);
        newName = isWear ? `Watch_API_${ver}_Device_${rand}` :
                  isTv ? `TV_API_${ver}_Device_${rand}` :
                  isAuto ? `Car_API_${ver}_Device_${rand}` :
                  `Android_${ver}_Device_${rand}`;
      }
      
      return {
        ...f,
        name: newName,
        systemImage: val,
        ram: isWear ? 1024 : isTv ? 2048 : isAuto ? 4096 : 4096,
        cores: isWear ? 1 : isTv ? 2 : isAuto ? 4 : 4,
        screenResolution: isWear ? '390x390' : isTv ? '1920x1080' : '1280x720',
        dpi: isWear ? 320 : isTv ? 240 : 240,
      }
    })
  }

  const getFriendlyName = (id) => {
    const parts = id.split(';')
    if (parts.length >= 4) {
      const apiLevel = parts[1].replace('android-', '')
      const type = parts[2].replace('_', ' ').toUpperCase()
      const arch = parts[3]
      return `Android (API ${apiLevel}) · ${type} · ${arch}`
    }
    return id
  }

  const handleCreate = async () => {
    if (!form.name.trim() || !form.systemImage) return
    // Resolve actual resolution string — handle the custom free-size option
    const resolvedResolution = form.screenResolution === 'custom'
      ? `${customW.trim() || '1080'}x${customH.trim() || '1920'}`
      : form.screenResolution
    setCreating(true)
    const result = await api.createAvd({
      name: form.name,
      system_image: form.systemImage,
      ram: form.ram,
      cores: form.cores,
      storage: form.storage,
      gpu_mode: form.gpuMode,
      screen_resolution: resolvedResolution,
      dpi: form.dpi,
    })
    setCreating(false)
    if (result.ok) {
      onCreated()
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 560 }}>
        <div className="modal-title"><Smartphone size={16} style={{ marginRight: 6 }} /><span>{t('device_create_title')}</span></div>
        <div className="modal-form">
          <div className="form-group">
            <label className="form-label">{t('device_name')}</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder={t('device_name_example')} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('device_system_image')}</label>
            {installedImages.length === 0 ? (
              <div className="alert alert-danger" style={{ fontSize: 12 }}>
                <AlertTriangle size={14} style={{ marginRight: 6 }} />{t('device_missing_images')}
              </div>
            ) : (
              <CustomSelect
                value={form.systemImage}
                onChange={handleSystemImageChange}
                options={installedImages.map(id => ({ value: id, label: getFriendlyName(id) }))}
              />
            )}
          </div>
          {isSpecial ? (
            <div className="alert alert-info" style={{ fontSize: 12, marginBottom: 16 }}>
              <Monitor size={14} style={{ marginRight: 6 }} /> {t('device_special_create_description')}
            </div>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">{t('device_resolution')}</label>
                <CustomSelect
                  value={form.screenResolution}
                  onChange={value => set('screenResolution', value)}
                  options={RESOLUTIONS.map(value => ({ value, label: t(`resolution_${value}`) }))}
                />
                {form.screenResolution === 'custom' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    <input
                      className="form-input"
                      type="number" min={240} max={7680}
                      value={customW}
                      onChange={e => setCustomW(e.target.value)}
                      placeholder={t('screen_width')}
                      style={{ flex: 1 }}
                    />
                    <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>×</span>
                    <input
                      className="form-input"
                      type="number" min={240} max={7680}
                      value={customH}
                      onChange={e => setCustomH(e.target.value)}
                      placeholder={t('screen_height')}
                      style={{ flex: 1 }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>px</span>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">{t('device_gpu_mode')}</label>
                <CustomSelect
                  value={form.gpuMode}
                  onChange={value => set('gpuMode', value)}
                  options={GPU_MODES.map(g => ({ value: g.val, label: t(g.label) }))}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  {form.gpuMode === 'auto' && t('device_gpu_auto_description')}
                  {form.gpuMode === 'host' && t('device_gpu_host_description')}
                  {form.gpuMode === 'software' && t('device_gpu_software_description')}
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <div className="flex items-center justify-between">
                    <label className="form-label">{t('device_ram')}</label>
                    <span className="text-accent font-mono" style={{ fontSize: 13 }}>{form.ram} MB</span>
                  </div>
                  <input type="range" min={1024} max={8192} step={512} value={form.ram} onChange={e => set('ram', Number(e.target.value))} />
                  <div className="flex justify-between text-sm text-muted mt-2"><span>1 GB</span><span>8 GB</span></div>
                </div>
                <div className="form-group">
                  <div className="flex items-center justify-between">
                    <label className="form-label">{t('device_cpu_cores')}</label>
                    <span className="text-accent font-mono" style={{ fontSize: 13 }}>{t('device_core_count', { count: form.cores })}</span>
                  </div>
                  <input type="range" min={1} max={8} step={1} value={form.cores} onChange={e => set('cores', Number(e.target.value))} />
                  <div className="flex justify-between text-sm text-muted mt-2"><span>1</span><span>8</span></div>
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <div className="flex items-center justify-between">
                    <label className="form-label">{t('device_storage')}</label>
                    <span className="text-accent font-mono" style={{ fontSize: 13 }}>{(form.storage / 1024).toFixed(0)} GB</span>
                  </div>
                  <input type="range" min={2048} max={32768} step={1024} value={form.storage} onChange={e => set('storage', Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <div className="flex items-center justify-between">
                    <label className="form-label">{t('device_screen_dpi')}</label>
                    <span className="text-accent font-mono" style={{ fontSize: 13 }}>{form.dpi} dpi</span>
                  </div>
                  <input type="range" min={120} max={640} step={40} value={form.dpi} onChange={e => set('dpi', Number(e.target.value))} />
                </div>
              </div>
              <div className="alert alert-info" style={{ fontSize: 12 }}>
                <Wrench size={14} style={{ marginRight: 6 }} />{t('device_x86_tip')}
              </div>
            </>
          )}

          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose} disabled={creating}>{t('cancel')}</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? <><Spinner size={14} />{t('device_creating')}</> : <><Smartphone size={14} style={{ marginRight: 6 }} />{t('device_create_action')}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DeviceCard({ avd, onLaunch, onStop, onDelete, onEdit, logs = [] }) {
  const { t } = useTranslation()
  const [launching, setLaunching] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [showConfirmWipe, setShowConfirmWipe] = useState(false)

  const handleLaunch = async () => { setLaunching(true); await onLaunch(avd, false); setLaunching(false) }
  const handleWipeLaunch = () => {
    setShowConfirmWipe(true)
  }
  const handleStop = async () => { setStopping(true); await onStop(avd); setStopping(false) }
  
  const handleDelete = () => {
    setShowConfirmDelete(true)
  }

  const handleCopyLogs = () => {
    const logText = logs.join('\n')
    navigator.clipboard.writeText(logText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const apiLevel = avd.api?.match(/android-(\d+)/)?.[1] || '?'
  const imgType = avd.api?.includes('playstore') ? 'Play Store' : avd.api?.includes('google_apis') ? 'Google APIs' : 'AOSP'
  const active = avd.starting || avd.running
  const gpu = avd.compatibility_mode ? 'software' : avd.gpu || 'auto'

  const getGpuBadge = () => {
    if (gpu === 'host') {
      return (
        <span className="badge" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', borderColor: 'rgba(239,68,68,0.25)', fontWeight: 600, fontSize: 10 }}>
          <Zap size={10} style={{ marginRight: 4 }} /> {t('device_gpu_host_badge')}
        </span>
      )
    }
    if (gpu === 'software') {
      return (
        <span className="badge" style={{ background: 'rgba(156,163,175,0.12)', color: '#9ca3af', borderColor: 'rgba(156,163,175,0.25)', fontWeight: 500, fontSize: 10 }}>
          <Monitor size={10} style={{ marginRight: 4 }} /> {t('device_gpu_software_badge')}
        </span>
      )
    }
    return (
      <span className="badge" style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', borderColor: 'rgba(59,130,246,0.25)', fontWeight: 600, fontSize: 10 }}>
        <Wrench size={10} style={{ marginRight: 4 }} /> {t('device_gpu_auto_badge')}
      </span>
    )
  }

  return (
    <div className={`device-card ${avd.running ? 'running' : ''}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="device-name">{avd.name.replace(/_/g, ' ')}</div>
          <div className="device-gpu-info">
            <Monitor size={12} style={{ marginRight: 6 }} />
            <span>{t('device_specs', { gpu, cores: avd.cores || '4', ram: avd.ram ? Math.round(Number(avd.ram) / 1024) : 4 })}</span>
          </div>
        </div>
        <span className={`badge ${avd.starting ? 'badge-warn' : avd.running ? 'badge-running' : 'badge-stopped'}`}>
          {avd.running && <span className="dot" />}
          {t(avd.starting ? 'device_starting' : avd.running ? 'running' : 'device_stopped')}
        </span>
      </div>
      <div className="device-meta">
        <span className="device-spec">API {apiLevel}</span>
        <span className="device-spec">{imgType}</span>
        {avd.arch && <span className="device-spec">{avd.arch}</span>}
        {avd.source === 'system' && <span className="device-spec">{t('device_source_system')}</span>}
        {getGpuBadge()}
      </div>
      <div className="device-actions">
        {!active ? (
          <>
            <button className="btn btn-success btn-sm" onClick={handleLaunch} disabled={launching}>
              {launching ? <><Spinner size={12} />{t('device_starting')}</> : <><Play size={12} style={{ marginRight: 6 }} />{t('device_launch')}</>}
            </button>
            <button className="btn btn-ghost btn-sm" style={{ color: '#fbbf24' }} onClick={handleWipeLaunch} disabled={launching} title={t('device_wipe_tooltip')}>
              <Zap size={12} style={{ marginRight: 6 }} /> {t('device_wipe_boot')}
            </button>
          </>
        ) : (
          <button className="btn btn-danger btn-sm" onClick={handleStop} disabled={stopping}>
            {stopping ? <><Spinner size={12} />{t('device_stopping')}</> : <><Play size={12} style={{ marginRight: 6, transform: 'rotate(180deg)' }} />{t('device_stop')}</>}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => setShowLogs(v => !v)}>
          {showLogs ? <><EyeOff size={12} style={{ marginRight: 6 }} />{t('device_hide_logs')}</> : <><Eye size={12} style={{ marginRight: 6 }} />{t('device_logs')}</>}
        </button>
        {logs.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={handleCopyLogs} style={{ color: copied ? 'var(--text-green)' : 'inherit' }}>
            {copied ? <><Save size={12} style={{ marginRight: 6 }} />{t('device_logs_copied')}</> : <><Copy size={12} style={{ marginRight: 6 }} />{t('device_copy_logs')}</>}
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => onEdit(avd)}
            title={t('device_edit_tooltip')} disabled={active}>
            <Pencil size={12} />
          </button>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={handleDelete}
            title={t('device_delete_tooltip')} style={{ color: '#ef4444' }} disabled={active}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {showLogs && <ConsoleLog lines={logs} />}

      {showConfirmDelete && (
        <div className="modal-overlay" onClick={() => setShowConfirmDelete(false)}>
          <div className="modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ color: '#ef4444' }}>
              <AlertTriangle size={16} style={{ marginRight: 6 }} /> <span>{t('device_delete_title')}</span>
            </div>
            <div style={{ padding: '16px 20px', fontSize: 13, lineHeight: '1.5', color: 'var(--text-secondary)' }}>
              {t('device_delete_question', { name: avd.name.replace(/_/g, ' ') })}
              <br /><br />
              {t('device_delete_warning')}
              <strong style={{ color: '#ef4444' }}> {t('device_action_irreversible')}</strong>
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.03)', marginTop: 0 }}>
               <button className="btn btn-ghost" onClick={() => setShowConfirmDelete(false)}>{t('cancel')}</button>
               <button className="btn btn-danger" onClick={async () => {
                 setShowConfirmDelete(false)
                 await onDelete(avd)
               }} style={{ background: '#ef4444', color: '#fff' }}>
                 <Trash2 size={12} style={{ marginRight: 6 }} /> {t('device_delete_permanently')}
               </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmWipe && (
        <div className="modal-overlay" onClick={() => setShowConfirmWipe(false)}>
          <div className="modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ color: '#fbbf24' }}>
              <AlertTriangle size={16} style={{ marginRight: 6 }} /> <span>{t('device_wipe_title')}</span>
            </div>
            <div style={{ padding: '16px 20px', fontSize: 13, lineHeight: '1.5', color: 'var(--text-secondary)' }}>
              {t('device_wipe_question', { name: avd.name.replace(/_/g, ' ') })}
              <br /><br />
              {t('device_wipe_warning')}
              <strong style={{ color: '#fbbf24' }}> {t('device_action_irreversible')}</strong>
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.03)', marginTop: 0 }}>
               <button className="btn btn-ghost" onClick={() => setShowConfirmWipe(false)}>{t('cancel')}</button>
               <button className="btn btn-primary" onClick={async () => {
                 setShowConfirmWipe(false)
                 setLaunching(true)
                 await onLaunch(avd, true)
                 setLaunching(false)
               }} style={{ background: '#fbbf24', color: '#09090b', border: 'none' }}>
                 <Zap size={12} style={{ marginRight: 6 }} /> {t('device_wipe_boot_confirm')}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function EditAvdDialog({ avd, gpus, onClose, onSaved }) {
  const { t } = useTranslation()
  const isSystem = avd.source === 'system'
  const apiLower = (avd.api || '').toLowerCase()
  const targetLower = (avd.target || '').toLowerCase()
  const isWear = apiLower.includes('wear') || targetLower.includes('wear')
  const isTv = apiLower.includes('tv') || targetLower.includes('tv')
  const isAuto = apiLower.includes('automotive')
  const isSpecial = isWear || isTv || isAuto

  const dedicatedGpu = Array.isArray(gpus) ? (gpus.find(g => g.is_dedicated) || gpus[0]) : null
  const gpuNameStr = dedicatedGpu ? dedicatedGpu.name : t('device_dedicated_gpu')

  const [ram, setRam] = useState(avd ? Number(avd.ram) || 4096 : 4096)
  const [cores, setCores] = useState(avd ? Number(avd.cores) || 4 : 4)
  const [gpuMode, setGpuMode] = useState(avd ? avd.gpu || 'auto' : 'auto')
  
  // Load per-device boot settings with fallbacks to global defaults
  const [quickBoot, setQuickBoot] = useState(() => {
    const val = localStorage.getItem(`emulator_quick_boot_${avd.name}`)
    if (val !== null) return val === 'true'
    return localStorage.getItem('emulator_quick_boot') === 'true'
  })
  const [bootAnim, setBootAnim] = useState(() => {
    const val = localStorage.getItem(`emulator_boot_anim_${avd.name}`)
    if (val !== null) return val !== 'false'
    return localStorage.getItem('emulator_boot_anim') !== 'false'
  })
  
  const [saving, setSaving] = useState(false)
  // Pre-fill resolution from avd config — fall back to the closest preset or '1280x720'
  const [resolution, setResolution] = useState(() => {
    if (avd.resolution) return avd.resolution
    if (avd.skin) {
      // skin is often stored as WxH e.g. "1080x1920"
      const parts = avd.skin.split('x')
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return avd.skin
    }
    return isWear ? '390x390' : isTv ? '1920x1080' : '1280x720'
  })
  const [dpi, setDpi] = useState(() => {
    if (avd.dpi) return Number(avd.dpi)
    return isWear ? 320 : isTv ? 240 : 240
  })
  const [ultraGaming, setUltraGaming] = useState(() => {
    return localStorage.getItem(`emulator_ultra_gaming_${avd.name}`) === 'true'
  })
  const [speedMode, setSpeedMode] = useState(() => {
    const val = localStorage.getItem(`emulator_speed_mode_${avd.name}`)
    if (val !== null) return val === 'true'
    return true
  })

  // Custom free-size: if the saved resolution doesn't match any preset, auto-select "custom"
  const knownVals = RESOLUTIONS.filter(value => value !== 'custom')
  const isCurrentCustom = !knownVals.includes(resolution)
  const initParts = isCurrentCustom ? resolution.split('x') : ['1080', '1920']
  const [customW, setCustomW] = useState(initParts[0] || '1080')
  const [customH, setCustomH] = useState(initParts[1] || '1920')
  // If the current resolution doesn't match a preset, default the selector to 'custom'
  const [editResolution, setEditResolution] = useState(isCurrentCustom ? 'custom' : resolution)

  const handleSave = async () => {
    setSaving(true)
    // Resolve actual resolution string (handles the custom free-size option)
    const resolvedResolution = editResolution === 'custom'
      ? `${customW.trim() || '1080'}x${customH.trim() || '1920'}`
      : editResolution
    const result = await api.updateAvdConfig({
      name: avd.name,
      source: avd.source,
      cores: String(cores),
      ram: String(ram),
      gpu: gpuMode,
      resolution: resolvedResolution,
      dpi: String(dpi)
    })
    setSaving(false)
    if (result.ok) {
      // Save device-specific preferences
      if (!isSystem) {
        localStorage.setItem(`emulator_quick_boot_${avd.name}`, String(quickBoot))
        localStorage.setItem(`emulator_boot_anim_${avd.name}`, String(bootAnim))
        localStorage.setItem(`emulator_ultra_gaming_${avd.name}`, String(ultraGaming))
        localStorage.setItem(`emulator_speed_mode_${avd.name}`, String(speedMode))
      }
      onSaved()
    } else {
      alert(t('device_update_failed', { error: result.error ?? t('unknown_error') }))
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 500 }}>
        <div className="modal-title"><Pencil size={16} style={{ marginRight: 6 }} /><span>{t('device_edit_title', { name: avd.name.replace(/_/g, ' ') })}</span></div>
        <div className="modal-form">
          {isWear && (
            <div className="alert alert-warning" style={{ fontSize: 12, marginBottom: 16 }}>
              <Smartphone size={14} style={{ marginRight: 6 }} />{t('device_wear_detected')}
            </div>
          )}
          {isTv && (
            <div className="alert alert-warning" style={{ fontSize: 12, marginBottom: 16 }}>
              <Monitor size={14} style={{ marginRight: 6 }} />{t('device_tv_detected')}
            </div>
          )}
          {isAuto && (
            <div className="alert alert-warning" style={{ fontSize: 12, marginBottom: 16 }}>
              <Wrench size={14} style={{ marginRight: 6 }} />{t('device_automotive_detected')}
            </div>
          )}
          {isSpecial ? (
            <div className="alert alert-info" style={{ fontSize: 12, marginBottom: 16 }}>
              <Monitor size={14} style={{ marginRight: 6 }} /> {t('device_special_edit_description')}
            </div>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">{t('device_gpu_mode')}</label>
                <CustomSelect
                  value={gpuMode}
                  onChange={setGpuMode}
                  options={GPU_MODES.map(g => ({ value: g.val, label: t(g.label) }))}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  {gpuMode === 'auto' && t('device_gpu_auto_description')}
                  {gpuMode === 'host' && t('device_gpu_host_description')}
                  {gpuMode === 'software' && t('device_gpu_software_description')}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('device_resolution')}</label>
                <CustomSelect
                  value={editResolution}
                  onChange={setEditResolution}
                  options={RESOLUTIONS.map(value => ({ value, label: t(`resolution_${value}`) }))}
                />
                {editResolution === 'custom' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    <input
                      className="form-input"
                      type="number" min={240} max={7680}
                      value={customW}
                      onChange={e => setCustomW(e.target.value)}
                      placeholder={t('screen_width')}
                      style={{ flex: 1 }}
                    />
                    <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>×</span>
                    <input
                      className="form-input"
                      type="number" min={240} max={7680}
                      value={customH}
                      onChange={e => setCustomH(e.target.value)}
                      placeholder={t('screen_height')}
                      style={{ flex: 1 }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>px</span>
                  </div>
                )}
              </div>
              
              <div className="form-group">
                <div className="flex items-center justify-between">
                  <label className="form-label">{t('device_screen_density')}</label>
                  <span className="text-accent font-mono" style={{ fontSize: 13 }}>{dpi} DPI</span>
                </div>
                <input type="range" min={160} max={480} step={40} value={dpi} onChange={e => setDpi(Number(e.target.value))} />
                <div className="flex justify-between text-sm text-muted mt-2"><span>{t('device_dpi_low')}</span><span>{t('device_dpi_high')}</span></div>
              </div>
              
              <div className="form-group">
                <div className="flex items-center justify-between">
                  <label className="form-label">{t('device_ram_allocation')}</label>
                  <span className="text-accent font-mono" style={{ fontSize: 13 }}>{ram} MB</span>
                </div>
                <input type="range" min={1024} max={8192} step={512} value={ram} onChange={e => setRam(Number(e.target.value))} />
                <div className="flex justify-between text-sm text-muted mt-2"><span>1 GB</span><span>8 GB</span></div>
              </div>
              
              <div className="form-group">
                <div className="flex items-center justify-between">
                  <label className="form-label">{t('device_cpu_cores')}</label>
                  <span className="text-accent font-mono" style={{ fontSize: 13 }}>{t('device_core_count', { count: cores })}</span>
                </div>
                <input type="range" min={1} max={8} step={1} value={cores} onChange={e => setCores(Number(e.target.value))} />
                <div className="flex justify-between text-sm text-muted mt-2"><span>1</span><span>8</span></div>
              </div>

              <div className="alert alert-info" style={{ fontSize: 12 }}>
                <Wrench size={14} style={{ marginRight: 6 }} />{t('device_auto_gpu_hint', { gpu: gpuNameStr })}
              </div>
            </>
          )}

          {!isSystem && (
            <>
              <div className="divider" style={{ margin: '8px 0' }} />

              <div className="flex items-center justify-between" style={{ padding: '2px 0' }}>
                <div style={{ flex: 1, paddingRight: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}><Zap size={12} style={{ marginRight: 6 }} /> {t('device_quick_boot')}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('device_quick_boot_description')}</div>
                </div>
                <div className={`toggle ${quickBoot ? 'on' : ''}`} onClick={() => setQuickBoot(!quickBoot)} />
              </div>

              <div className="divider" style={{ margin: '4px 0' }} />

              <div className="flex items-center justify-between" style={{ padding: '2px 0' }}>
                <div style={{ flex: 1, paddingRight: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}><Monitor size={12} style={{ marginRight: 6 }} /> {t('device_boot_animation')}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('device_boot_animation_description')}</div>
                </div>
                <div className={`toggle ${bootAnim ? 'on' : ''}`} onClick={() => setBootAnim(!bootAnim)} />
              </div>

              <div className="divider" style={{ margin: '4px 0' }} />

              <div className="flex items-center justify-between" style={{ padding: '2px 0' }}>
                <div style={{ flex: 1, paddingRight: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2, color: 'var(--text-accent, #60a5fa)' }}><Zap size={12} style={{ marginRight: 6 }} /> {t('device_ultra_gaming')}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('device_ultra_gaming_description')}</div>
                </div>
                <div className={`toggle ${ultraGaming ? 'on' : ''}`} onClick={() => setUltraGaming(!ultraGaming)} />
              </div>

              <div className="divider" style={{ margin: '4px 0' }} />

              <div className="flex items-center justify-between" style={{ padding: '2px 0' }}>
                <div style={{ flex: 1, paddingRight: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2, color: 'var(--text-accent, #60a5fa)' }}><Zap size={12} style={{ marginRight: 6 }} /> {t('device_speed_mode')}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t('device_speed_mode_description')}</div>
                </div>
                <div className={`toggle ${speedMode ? 'on' : ''}`} onClick={() => setSpeedMode(!speedMode)} />
              </div>
            </>
          )}

          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>{t('cancel')}</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><Spinner size={14} />{t('device_saving')}</> : <><Save size={14} style={{ marginRight: 6 }} />{t('device_save')}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
