import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const DEFAULT_DELAY_MINUTES = 4
const DEFAULT_DELAY_SECONDS = 40
const EMPTY_TIME_TEXT = '--:--:--'
const MAX_TABS = 10
const MAX_TIMERS_PER_TAB = 20
const STORAGE_KEY = 'countdown-hub.state.v1'

const i18n = {
  zh: {
    pageTitle: '倒數計時器',
    addTab: '+ 新增標籤',
    addTabLimitReached: '已達標籤上限（{max}）',
    switchLang: 'EN',
    dragSort: '拖曳排序',
    timerNamePlaceholder: '計時器名稱',
    countdownSetup: '倒數時間設定',
    delaySetup: '延遲時間設定',
    hour: '時',
    minute: '分',
    second: '秒',
    countdownTime: '倒數時間',
    remainingTime: '剩餘時間',
    start: '開始',
    pause: '暫停',
    reset: '重設',
    delete: '刪除',
    startRecord: '開始時間紀錄',
    endRecord: '結束時間紀錄',
    addTimer: '新增計時器',
    addTimerLimitReached: '此標籤已達計時器上限（{max}）',
    clearAll: '清空全部',
    clearAllConfirm: '確定要清空所有標籤與計時器資料嗎？此動作無法復原。',
    deleteTabTitle: '刪除標籤',
    renameTabPrompt: '標籤名稱',
    keepOneTab: '至少需要保留 1 個標籤頁。',
    deleteTabConfirmWithTimers: '刪除標籤「{name}」以及其中所有計時器？',
    deleteTabConfirmEmpty: '刪除標籤「{name}」？',
    invalidHms: '請輸入正確的時、分、秒（分/秒 0–59）',
    invalidDelay: '請輸入正確的延遲分、秒（秒 0–59）',
    footerPlaceholder: '關於 · 贊助 · 隱私權',
  },
  en: {
    pageTitle: 'Countdown Timers',
    addTab: '+ Add Tab',
    addTabLimitReached: 'Tab limit reached ({max})',
    switchLang: '繁中',
    dragSort: 'Drag to reorder',
    timerNamePlaceholder: 'Timer name',
    countdownSetup: 'Countdown setup',
    delaySetup: 'Delay setup',
    hour: 'h',
    minute: 'm',
    second: 's',
    countdownTime: 'Countdown',
    remainingTime: 'Remaining',
    start: 'Start',
    pause: 'Pause',
    reset: 'Reset',
    delete: 'Delete',
    startRecord: 'Start time',
    endRecord: 'End time',
    addTimer: 'Add Timer',
    addTimerLimitReached: 'Timer limit reached for this tab ({max})',
    clearAll: 'Clear All',
    clearAllConfirm: 'Clear all tabs and timers? This cannot be undone.',
    deleteTabTitle: 'Delete tab',
    renameTabPrompt: 'Tab name',
    keepOneTab: 'At least one tab is required.',
    deleteTabConfirmWithTimers: 'Delete tab "{name}" and all timers in it?',
    deleteTabConfirmEmpty: 'Delete tab "{name}"?',
    invalidHms: 'Enter valid hour/minute/second (minute/second 0–59).',
    invalidDelay: 'Enter valid delay minute/second (second 0–59).',
    footerPlaceholder: 'About · Donate · Privacy',
  },
}

const msFromParts = (h, m, s) => (h * 3600 + m * 60 + s) * 1000
const clamp = (n, min, max) => Math.min(max, Math.max(min, n))

function formatTime(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function formatDateParts(date) {
  if (!date) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return { dateText: `${y}-${m}-${d}`, timeText: `${hh}:${mm}:${ss}` }
}

function DateTimeDisplay({ date }) {
  const parts = formatDateParts(date)
  if (!parts) return <span>{EMPTY_TIME_TEXT}</span>
  return (
    <span className="datetime-wrap">
      <span>{parts.dateText}</span>
      <span className="datetime-sep" aria-hidden="true" />
      <span>{parts.timeText}</span>
    </span>
  )
}

function createTimer(id) {
  const totalMs = msFromParts(0, DEFAULT_DELAY_MINUTES, DEFAULT_DELAY_SECONDS)
  return {
    id,
    name: '',
    baseH: 0,
    baseM: 0,
    baseS: 0,
    delayM: DEFAULT_DELAY_MINUTES,
    delayS: DEFAULT_DELAY_SECONDS,
    totalMs,
    remainingMs: totalMs,
    isRunning: false,
    finished: false,
    startedAt: null,
    endedAt: null,
    endAtEpoch: null,
  }
}

function createTab(id) {
  return { id, name: `tab ${id}`, timers: [], nextTimerId: 1 }
}

function parseDateOrNull(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function loadPersistedState() {
  const fallback = {
    language: 'zh',
    tabs: [createTab(1)],
    activeTabId: 1,
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    const language = parsed.language === 'en' ? 'en' : 'zh'
    const inputTabs = Array.isArray(parsed.tabs) ? parsed.tabs : []
    const normalizedTabs = inputTabs
      .slice(0, MAX_TABS)
      .map((tab, tabIndex) => {
        const tabId = Number(tab.id) > 0 ? Number(tab.id) : tabIndex + 1
        const inputTimers = Array.isArray(tab.timers) ? tab.timers : []
        const timers = inputTimers.slice(0, MAX_TIMERS_PER_TAB).map((tm, timerIndex) => {
          const timerId = Number(tm.id) > 0 ? Number(tm.id) : timerIndex + 1
          const baseH = clamp(Number(tm.baseH) || 0, 0, 999)
          const baseM = clamp(Number(tm.baseM) || 0, 0, 59)
          const baseS = clamp(Number(tm.baseS) || 0, 0, 59)
          const delayM = Math.max(0, Number(tm.delayM) || 0)
          const delayS = clamp(Number(tm.delayS) || 0, 0, 59)
          const totalMs = msFromParts(baseH, baseM, baseS) + msFromParts(0, delayM, delayS)
          const remainingMs = clamp(Number(tm.remainingMs) || 0, 0, totalMs)
          const endAtEpoch = Number(tm.endAtEpoch)
          return {
            ...createTimer(timerId),
            ...tm,
            id: timerId,
            name: typeof tm.name === 'string' ? tm.name : '',
            baseH,
            baseM,
            baseS,
            delayM,
            delayS,
            totalMs,
            remainingMs,
            isRunning: Boolean(tm.isRunning) && Number.isFinite(endAtEpoch),
            finished: Boolean(tm.finished),
            startedAt: parseDateOrNull(tm.startedAt),
            endedAt: parseDateOrNull(tm.endedAt),
            endAtEpoch: Number.isFinite(endAtEpoch) ? endAtEpoch : null,
          }
        })
        const maxTimerId = timers.reduce((max, tm) => Math.max(max, tm.id), 0)
        return {
          id: tabId,
          name: typeof tab.name === 'string' && tab.name.trim() ? tab.name : `tab ${tabId}`,
          timers,
          nextTimerId:
            Number(tab.nextTimerId) > maxTimerId
              ? Number(tab.nextTimerId)
              : maxTimerId + 1,
        }
      })
    const tabs = normalizedTabs.length ? normalizedTabs : fallback.tabs
    const activeTabId = tabs.some((tab) => tab.id === parsed.activeTabId)
      ? parsed.activeTabId
      : tabs[0].id
    return { language, tabs, activeTabId }
  } catch {
    return fallback
  }
}

export default function App() {
  const initialState = useMemo(() => loadPersistedState(), [])
  const [language, setLanguage] = useState(initialState.language)
  const [tabs, setTabs] = useState(initialState.tabs)
  const [activeTabId, setActiveTabId] = useState(initialState.activeTabId)
  const [dragState, setDragState] = useState(null)
  const nextTabIdRef = useRef(
    Math.max(2, ...initialState.tabs.map((tab) => Number(tab.id) + 1)),
  )

  const t = (key, vars = {}) => {
    const text = (i18n[language] && i18n[language][key]) || key
    return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`))
  }

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) || tabs[0],
    [tabs, activeTabId],
  )

  useEffect(() => {
    const timer = setInterval(() => {
      setTabs((prev) =>
        prev.map((tab) => ({
          ...tab,
          timers: tab.timers.map((tm) => {
            if (!tm.isRunning || !tm.endAtEpoch) return tm
            const nextRemaining = Math.max(0, tm.endAtEpoch - Date.now())
            if (nextRemaining <= 0) {
              return {
                ...tm,
                remainingMs: 0,
                isRunning: false,
                finished: true,
                endAtEpoch: null,
                endedAt: new Date(),
              }
            }
            return { ...tm, remainingMs: nextRemaining }
          }),
        })),
      )
    }, 250)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const data = {
      language,
      activeTabId,
      tabs: tabs.map((tab) => ({
        ...tab,
        timers: tab.timers.map((tm) => ({
          ...tm,
          startedAt: tm.startedAt ? new Date(tm.startedAt).toISOString() : null,
          endedAt: tm.endedAt ? new Date(tm.endedAt).toISOString() : null,
        })),
      })),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [language, tabs, activeTabId])

  const updateTimer = (tabId, timerId, updater) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id !== tabId
          ? tab
          : {
              ...tab,
              timers: tab.timers.map((tm) =>
                tm.id === timerId ? updater(tm) : tm,
              ),
            },
      ),
    )
  }

  const validateAndRecalc = (tm) => {
    const h = clamp(Number(tm.baseH) || 0, 0, 999)
    const m = Number(tm.baseM) || 0
    const s = Number(tm.baseS) || 0
    const dm = Number(tm.delayM) || 0
    const ds = Number(tm.delayS) || 0
    if (m < 0 || m > 59 || s < 0 || s > 59) {
      alert(t('invalidHms'))
      return tm
    }
    if (dm < 0 || ds < 0 || ds > 59) {
      alert(t('invalidDelay'))
      return tm
    }
    const totalMs = msFromParts(h, m, s) + msFromParts(0, dm, ds)
    const shouldSyncRemaining = !tm.isRunning || tm.finished || tm.remainingMs <= 0
    return {
      ...tm,
      baseH: h,
      baseM: m,
      baseS: s,
      delayM: dm,
      delayS: ds,
      totalMs,
      remainingMs: shouldSyncRemaining ? totalMs : tm.remainingMs,
      finished: false,
    }
  }

  const addTab = () => {
    if (tabs.length >= MAX_TABS) {
      alert(t('addTabLimitReached', { max: MAX_TABS }))
      return
    }
    const id = nextTabIdRef.current++
    setTabs((prev) => [...prev, createTab(id)])
    setActiveTabId(id)
  }

  const renameTab = (tab) => {
    const next = prompt(t('renameTabPrompt'), tab.name)
    if (next === null) return
    const cleaned = next.trim()
    if (!cleaned) return
    setTabs((prev) =>
      prev.map((tb) => (tb.id === tab.id ? { ...tb, name: cleaned } : tb)),
    )
  }

  const deleteTab = (tab) => {
    if (tabs.length <= 1) {
      alert(t('keepOneTab'))
      return
    }
    const ok = confirm(
      tab.timers.length
        ? t('deleteTabConfirmWithTimers', { name: tab.name })
        : t('deleteTabConfirmEmpty', { name: tab.name }),
    )
    if (!ok) return
    setTabs((prev) => prev.filter((tb) => tb.id !== tab.id))
    if (activeTabId === tab.id) {
      const next = tabs.find((tb) => tb.id !== tab.id)
      if (next) setActiveTabId(next.id)
    }
  }

  const addTimer = (tabId) => {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab
        if (tab.timers.length >= MAX_TIMERS_PER_TAB) {
          return tab
        }
        const timerId = tab.nextTimerId
        return {
          ...tab,
          nextTimerId: timerId + 1,
          timers: [...tab.timers, createTimer(timerId)],
        }
      }),
    )
  }

  const removeTimer = (tabId, timerId) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id !== tabId
          ? tab
          : { ...tab, timers: tab.timers.filter((tm) => tm.id !== timerId) },
      ),
    )
  }

  const toggleStart = (tabId, timerId) => {
    updateTimer(tabId, timerId, (tm) => {
      if (tm.isRunning) {
        const remaining = tm.endAtEpoch
          ? Math.max(0, tm.endAtEpoch - Date.now())
          : tm.remainingMs
        return { ...tm, isRunning: false, remainingMs: remaining, endAtEpoch: null }
      }
      if (tm.remainingMs <= 0) return tm
      return {
        ...tm,
        isRunning: true,
        finished: false,
        startedAt: new Date(),
        endedAt: null,
        endAtEpoch: Date.now() + tm.remainingMs,
      }
    })
  }

  const resetTimer = (tabId, timerId) => {
    updateTimer(tabId, timerId, (tm) => ({
      ...tm,
      isRunning: false,
      finished: false,
      remainingMs: tm.totalMs,
      startedAt: null,
      endedAt: null,
      endAtEpoch: null,
    }))
  }

  const onDragStartHandle = (e, tabId, timerId) => {
    e.dataTransfer.effectAllowed = 'move'
    setDragState({ tabId, sourceId: timerId, overId: timerId, position: 'after' })
  }

  const onDragOverCard = (e, tabId, timerId) => {
    e.preventDefault()
    if (!dragState || dragState.tabId !== tabId) return
    const rect = e.currentTarget.getBoundingClientRect()
    const middle = rect.top + rect.height / 2
    const position = e.clientY < middle ? 'before' : 'after'
    setDragState((prev) =>
      prev ? { ...prev, overId: timerId, position } : prev,
    )
  }

  const onDropContainer = (e, tabId) => {
    e.preventDefault()
    if (!dragState || dragState.tabId !== tabId) return
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab
        const timers = [...tab.timers]
        const from = timers.findIndex((tm) => tm.id === dragState.sourceId)
        const over = timers.findIndex((tm) => tm.id === dragState.overId)
        if (from < 0 || over < 0) return tab
        const [item] = timers.splice(from, 1)
        const insertAt = dragState.position === 'before' ? over : over + 1
        timers.splice(insertAt > from ? insertAt - 1 : insertAt, 0, item)
        return { ...tab, timers }
      }),
    )
    setDragState(null)
  }

  const clearAllData = () => {
    const ok = confirm(t('clearAllConfirm'))
    if (!ok) return
    const resetTabs = [createTab(1)]
    nextTabIdRef.current = 2
    setTabs(resetTabs)
    setActiveTabId(1)
    localStorage.removeItem(STORAGE_KEY)
  }

  const isTabLimitReached = tabs.length >= MAX_TABS
  const isTimerLimitReached = activeTab.timers.length >= MAX_TIMERS_PER_TAB

  return (
    <div className="app">
      <button
        className="lang-toggle-btn"
        onClick={() => setLanguage((l) => (l === 'zh' ? 'en' : 'zh'))}
      >
        {t('switchLang')}
      </button>

      <div className="app-shell">
      <div className="app-main">
      <h1>{t('pageTitle')}</h1>

      <div className="tabs-bar">
        <div className="tabs">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className="tab-name" onDoubleClick={() => renameTab(tab)}>
                {tab.name}
              </span>
              <button
                className="tab-close"
                title={t('deleteTabTitle')}
                onClick={(e) => {
                  e.stopPropagation()
                  deleteTab(tab)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          className="add-tab-btn"
          onClick={addTab}
          disabled={isTabLimitReached}
          title={
            isTabLimitReached ? t('addTabLimitReached', { max: MAX_TABS }) : undefined
          }
        >
          {t('addTab')}
        </button>
      </div>

      <div className="timers-container" onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDropContainer(e, activeTab.id)}>
        {activeTab.timers.map((tm) => (
          <div
            key={tm.id}
            className={`timer-card ${tm.finished ? 'finished' : ''}`}
            onDragOver={(e) => onDragOverCard(e, activeTab.id, tm.id)}
          >
            {dragState &&
              dragState.tabId === activeTab.id &&
              dragState.overId === tm.id &&
              dragState.position === 'before' && <div className="drop-indicator in-card" />}

            <div className="timer-zone">
              <div className="zone-row">
                <div
                  className="drag-handle"
                  draggable
                  title={t('dragSort')}
                  onDragStart={(e) => onDragStartHandle(e, activeTab.id, tm.id)}
                  onDragEnd={() => setDragState(null)}
                >
                  ⋮⋮
                </div>
                <input
                  className="timer-title-input"
                  placeholder={t('timerNamePlaceholder')}
                  value={tm.name}
                  onChange={(e) =>
                    updateTimer(activeTab.id, tm.id, (cur) => ({ ...cur, name: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="timer-zone">
              <div className="zone-block">
                <div className="label-small">{t('countdownSetup')}</div>
                <div className="time-input-row">
                  <input type="number" value={tm.baseH} onChange={(e) => updateTimer(activeTab.id, tm.id, (cur) => validateAndRecalc({ ...cur, baseH: e.target.value }))} />
                  <span>{t('hour')}</span>
                  <input type="number" value={tm.baseM} onChange={(e) => updateTimer(activeTab.id, tm.id, (cur) => validateAndRecalc({ ...cur, baseM: e.target.value }))} />
                  <span>{t('minute')}</span>
                  <input type="number" value={tm.baseS} onChange={(e) => updateTimer(activeTab.id, tm.id, (cur) => validateAndRecalc({ ...cur, baseS: e.target.value }))} />
                  <span>{t('second')}</span>
                </div>
              </div>
              <div className="zone-block">
                <div className="label-small">{t('delaySetup')}</div>
                <div className="time-input-row">
                  <input type="number" value={tm.delayM} onChange={(e) => updateTimer(activeTab.id, tm.id, (cur) => validateAndRecalc({ ...cur, delayM: e.target.value }))} />
                  <span>{t('minute')}</span>
                  <input type="number" value={tm.delayS} onChange={(e) => updateTimer(activeTab.id, tm.id, (cur) => validateAndRecalc({ ...cur, delayS: e.target.value }))} />
                  <span>{t('second')}</span>
                </div>
              </div>
            </div>

            <div className="timer-zone">
              <div className="stats-row">
                <div className="zone-block">
                  <div className="label-small">{t('countdownTime')}</div>
                  <div className="timer-total-display">{formatTime(tm.totalMs)}</div>
                </div>
                <div className="zone-block">
                  <div className="label-small">{t('remainingTime')}</div>
                  <div className="timer-display">{formatTime(tm.remainingMs)}</div>
                </div>
              </div>
            </div>

            <div className="timer-zone">
              <div className="timer-actions">
                <button className={`btn-start ${tm.isRunning ? 'paused' : ''}`} onClick={() => toggleStart(activeTab.id, tm.id)}>
                  {tm.isRunning ? t('pause') : t('start')}
                </button>
                <button className="btn-reset" onClick={() => resetTimer(activeTab.id, tm.id)}>
                  {t('reset')}
                </button>
                <button className="btn-delete" onClick={() => removeTimer(activeTab.id, tm.id)}>
                  {t('delete')}
                </button>
              </div>
            </div>

            <div className="timer-zone">
              <div className="zone-block">
                <div className="label-small">{t('startRecord')}</div>
                <div className="timer-start-at"><DateTimeDisplay date={tm.startedAt} /></div>
              </div>
              <div className="zone-block">
                <div className="label-small">{t('endRecord')}</div>
                <div className="timer-end-at"><DateTimeDisplay date={tm.endedAt} /></div>
              </div>
            </div>

            {dragState &&
              dragState.tabId === activeTab.id &&
              dragState.overId === tm.id &&
              dragState.position === 'after' && <div className="drop-indicator in-card" />}
          </div>
        ))}
      </div>

      <div className="control-panel">
        <button
          onClick={() => addTimer(activeTab.id)}
          disabled={isTimerLimitReached}
          title={
            isTimerLimitReached
              ? t('addTimerLimitReached', { max: MAX_TIMERS_PER_TAB })
              : undefined
          }
        >
          {t('addTimer')}
        </button>
        <button className="clear-all-btn" onClick={clearAllData}>
          {t('clearAll')}
        </button>
      </div>
      </div>

      <footer className="site-footer" role="contentinfo">
        {t('footerPlaceholder')}
      </footer>
      </div>
    </div>
  )
}
