import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'

const DEFAULT_DELAY_MINUTES = 4
const DEFAULT_DELAY_SECONDS = 40
const EMPTY_TIME_TEXT = '--:--:--'
const MAX_TABS = 10
const MAX_TIMERS_PER_TAB = 20
/** 標籤名稱字數上限（與頂部 tab 膠囊寬度相符，超出僅截斷、不提示） */
const MAX_TAB_NAME_LENGTH = 20
/** 計時器名稱字數上限 */
const MAX_TIMER_NAME_LENGTH = 20
const STORAGE_KEY = 'countdown-hub.state.v1'

function clampStringLen(str, maxLen) {
  if (typeof str !== 'string') return ''
  return str.length > maxLen ? str.slice(0, maxLen) : str
}

/** 與手機版 CSS 斷點一致：此寬度以下計時器名稱僅單行 */
const MOBILE_TIMER_TITLE_MQ = '(max-width: 480px)'

function normalizeTimerNameNewlines(raw, allowMultiline) {
  let s = typeof raw === 'string' ? raw : ''
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!allowMultiline) {
    return s.replace(/\n/g, '')
  }
  const first = s.indexOf('\n')
  if (first === -1) return s
  const second = s.indexOf('\n', first + 1)
  if (second === -1) return s
  return s.slice(0, second)
}

function clampTimerName(raw, allowMultiline) {
  return clampStringLen(
    normalizeTimerNameNewlines(raw, allowMultiline),
    MAX_TIMER_NAME_LENGTH,
  )
}

function adjustTimerTitleTextareaHeight(el) {
  if (!el || el.tagName !== 'TEXTAREA') return
  const cs = getComputedStyle(el)
  const lh = parseFloat(cs.lineHeight)
  const lineHeight = Number.isFinite(lh) ? lh : 16.2
  const pt = parseFloat(cs.paddingTop) || 0
  const pb = parseFloat(cs.paddingBottom) || 0
  const maxH = lineHeight * 2 + pt + pb
  el.style.height = 'auto'
  const h = Math.min(el.scrollHeight, maxH)
  el.style.height = `${h}px`
  el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden'
}

function useMatchMedia(query) {
  const [matches, setMatches] = useState(
    () =>
      typeof window !== 'undefined'
        ? window.matchMedia(query).matches
        : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const fn = () => setMatches(mq.matches)
    fn()
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [query])
  return matches
}

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
    clearAllDone: '已清空所有標籤與計時器。',
    deleteTabTitle: '刪除標籤',
    renameTabPrompt: '標籤名稱',
    renameTabSave: '確定',
    renameTabCancel: '取消',
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
    clearAllDone: 'All tabs and timers have been cleared.',
    deleteTabTitle: 'Delete tab',
    renameTabPrompt: 'Tab name',
    renameTabSave: 'OK',
    renameTabCancel: 'Cancel',
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

function normalizeNonNegativeIntInput(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return 0
  const n = Number.parseInt(s, 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function normalizeEventNumberInput(event) {
  const normalized = normalizeNonNegativeIntInput(event.target.value)
  const normalizedText = String(normalized)
  if (event.target.value !== normalizedText) {
    event.target.value = normalizedText
  }
  return normalized
}

function formatTime(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
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
            name: clampTimerName(
              typeof tm.name === 'string' ? tm.name : '',
              true,
            ),
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
          name: clampStringLen(
            typeof tab.name === 'string' && tab.name.trim()
              ? tab.name.trim()
              : `tab ${tabId}`,
            MAX_TAB_NAME_LENGTH,
          ),
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
  /** 原生 prompt 無法 maxLength，改用自訂對話框才能鎖字數 */
  const [renameTabDialog, setRenameTabDialog] = useState(null)
  const activeContainerRef = useRef(null)
  const dragRuntimeRef = useRef(null)
  const nextTabIdRef = useRef(
    Math.max(2, ...initialState.tabs.map((tab) => Number(tab.id) + 1)),
  )
  const isMobileTimerTitle = useMatchMedia(MOBILE_TIMER_TITLE_MQ)
  const timerTitleTextareaRefs = useRef(new Map())

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

  useLayoutEffect(() => {
    if (isMobileTimerTitle) return
    timerTitleTextareaRefs.current.forEach((el) => {
      if (el?.isConnected) adjustTimerTitleTextareaHeight(el)
    })
  }, [activeTab.timers, isMobileTimerTitle, language])

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

  /** 無副作用；供 state updater 使用（Strict Mode 可能重複呼叫 updater，不可在內層 alert） */
  const validateAndRecalcPure = (tm) => {
    const h = clamp(Number(tm.baseH) || 0, 0, 999)
    const m = Number(tm.baseM) || 0
    const s = Number(tm.baseS) || 0
    const dm = Number(tm.delayM) || 0
    const ds = Number(tm.delayS) || 0
    if (m < 0 || m > 59 || s < 0 || s > 59) {
      return { ok: false, reason: 'hms' }
    }
    if (dm < 0 || ds < 0 || ds > 59) {
      return { ok: false, reason: 'delay' }
    }
    const totalMs = msFromParts(h, m, s) + msFromParts(0, dm, ds)
    const shouldSyncRemaining = !tm.isRunning || tm.finished || tm.remainingMs <= 0
    return {
      ok: true,
      timer: {
        ...tm,
        baseH: h,
        baseM: m,
        baseS: s,
        delayM: dm,
        delayS: ds,
        totalMs,
        remainingMs: shouldSyncRemaining ? totalMs : tm.remainingMs,
        finished: false,
      },
    }
  }

  const applyTimeFieldChange = (tabId, timerId, fieldKey, e, prevValue) => {
    const normalized = normalizeNonNegativeIntInput(e.target.value)
    let invalidMsg = null
    updateTimer(tabId, timerId, (cur) => {
      const next = { ...cur, [fieldKey]: normalized }
      const result = validateAndRecalcPure(next)
      if (!result.ok) {
        invalidMsg =
          result.reason === 'delay' ? t('invalidDelay') : t('invalidHms')
        return cur
      }
      return result.timer
    })
    if (invalidMsg) {
      alert(invalidMsg)
      e.target.value = String(prevValue)
      return
    }
    normalizeEventNumberInput(e)
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

  const openRenameTab = (tab) => {
    setRenameTabDialog({
      tabId: tab.id,
      value: clampStringLen(tab.name, MAX_TAB_NAME_LENGTH),
    })
  }

  const confirmRenameTab = () => {
    if (!renameTabDialog) return
    const cleaned = clampStringLen(
      renameTabDialog.value.trim(),
      MAX_TAB_NAME_LENGTH,
    )
    if (!cleaned) {
      setRenameTabDialog(null)
      return
    }
    setTabs((prev) =>
      prev.map((tb) =>
        tb.id === renameTabDialog.tabId ? { ...tb, name: cleaned } : tb,
      ),
    )
    setRenameTabDialog(null)
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

  const onPointerDownHandle = (e, tabId, timerId) => {
    if (e.button !== 0) return
    const container = activeContainerRef.current
    if (!container) return
    const handleEl = e.currentTarget
    const cardEl = handleEl.closest('.timer-card')
    if (!cardEl) return
    e.preventDefault()

    const pointerId = e.pointerId
    handleEl.setPointerCapture(pointerId)

    const cardRect = cardEl.getBoundingClientRect()
    const offsetX = e.clientX - cardRect.left
    const offsetY = e.clientY - cardRect.top

    const placeholderEl = document.createElement('div')
    placeholderEl.className = 'drag-placeholder'
    placeholderEl.style.setProperty('--ph-h', `${cardRect.height}px`)
    container.insertBefore(placeholderEl, cardEl)

    const indicatorEl = document.createElement('div')
    indicatorEl.className = 'drop-indicator'
    container.insertBefore(indicatorEl, placeholderEl.nextSibling)

    cardEl.classList.add('dragging')
    cardEl.style.width = `${cardRect.width}px`
    cardEl.style.position = 'fixed'
    cardEl.style.left = `${cardRect.left}px`
    cardEl.style.top = `${cardRect.top}px`
    cardEl.style.zIndex = '999'

    document.body.classList.add('is-dragging-timer')

    dragRuntimeRef.current = {
      tabId,
      sourceId: timerId,
      pointerId,
      handleEl,
      cardEl,
      container,
      placeholderEl,
      indicatorEl,
      offsetX,
      offsetY,
      raf: null,
    }
  }

  useEffect(() => {
    const getAfterElement = (container, clientY) => {
      const cards = [...container.querySelectorAll('.timer-card:not(.dragging)')]
      let closest = { offset: Number.NEGATIVE_INFINITY, element: null }
      for (const el of cards) {
        const rect = el.getBoundingClientRect()
        const offset = clientY - (rect.top + rect.height / 2)
        if (offset < 0 && offset > closest.offset) {
          closest = { offset, element: el }
        }
      }
      return closest.element
    }

    const cleanup = () => {
      const rt = dragRuntimeRef.current
      if (!rt) return
      if (rt.raf) cancelAnimationFrame(rt.raf)
      rt.cardEl.classList.remove('dragging')
      rt.cardEl.style.position = ''
      rt.cardEl.style.left = ''
      rt.cardEl.style.top = ''
      rt.cardEl.style.width = ''
      rt.cardEl.style.zIndex = ''
      rt.cardEl.style.transform = ''
      rt.cardEl.style.pointerEvents = ''
      rt.placeholderEl.remove()
      rt.indicatorEl.remove()
      document.body.classList.remove('is-dragging-timer')
      dragRuntimeRef.current = null
    }

    const applyDomOrderToState = (tabId, container) => {
      const ids = [...container.querySelectorAll('.timer-card')]
        .map((el) => Number(el.dataset.timerId))
        .filter((id) => Number.isFinite(id))
      if (!ids.length) return
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== tabId) return tab
          const map = new Map(tab.timers.map((tm) => [tm.id, tm]))
          const ordered = ids.map((id) => map.get(id)).filter(Boolean)
          if (ordered.length !== tab.timers.length) return tab
          return { ...tab, timers: ordered }
        }),
      )
    }

    const moveAt = (rt, clientX, clientY) => {
      const x = clientX - rt.offsetX
      const y = clientY - rt.offsetY
      rt.cardEl.style.left = `${x}px`
      rt.cardEl.style.top = `${y}px`

      const sel = window.getSelection?.()
      if (sel && sel.rangeCount > 0) sel.removeAllRanges()

      const afterEl = getAfterElement(rt.container, clientY)
      if (afterEl) {
        rt.container.insertBefore(rt.indicatorEl, afterEl)
      } else {
        rt.container.appendChild(rt.indicatorEl)
      }

      const edge = 80
      const scrollY = window.scrollY
      const vpTop = scrollY
      const vpBottom = scrollY + window.innerHeight
      const yPage = clientY + scrollY
      if (yPage < vpTop + edge) {
        window.scrollTo({ top: scrollY - clamp((vpTop + edge - yPage) * 0.35, 3, 18) })
      } else if (yPage > vpBottom - edge) {
        window.scrollTo({ top: scrollY + clamp((yPage - (vpBottom - edge)) * 0.35, 3, 18) })
      }
    }

    const onPointerMove = (ev) => {
      const rt = dragRuntimeRef.current
      if (!rt || ev.pointerId !== rt.pointerId) return
      if (rt.raf) return
      rt.raf = requestAnimationFrame(() => {
        const current = dragRuntimeRef.current
        if (!current) return
        current.raf = null
        moveAt(current, ev.clientX, ev.clientY)
      })
    }

    const onPointerUp = (ev) => {
      const rt = dragRuntimeRef.current
      if (!rt || ev.pointerId !== rt.pointerId) return
      rt.handleEl.releasePointerCapture(rt.pointerId)

      if (rt.indicatorEl.parentElement === rt.container) {
        rt.container.insertBefore(rt.cardEl, rt.indicatorEl)
      } else {
        rt.container.insertBefore(rt.cardEl, rt.placeholderEl)
      }
      applyDomOrderToState(rt.tabId, rt.container)
      cleanup()
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      cleanup()
    }
  }, [])

  const clearAllData = () => {
    const ok = confirm(t('clearAllConfirm'))
    if (!ok) return
    const resetTabs = [createTab(1)]
    nextTabIdRef.current = 2
    setTabs(resetTabs)
    setActiveTabId(1)
    localStorage.removeItem(STORAGE_KEY)
    alert(t('clearAllDone'))
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
              <span className="tab-name" onDoubleClick={() => openRenameTab(tab)}>
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
        <button className="clear-all-btn" onClick={clearAllData}>
          {t('clearAll')}
        </button>
      </div>

      <div className="timers-container" ref={activeContainerRef}>
        {activeTab.timers.map((tm) => (
          <div
            key={tm.id}
            data-timer-id={tm.id}
            className={`timer-card ${tm.finished ? 'finished' : ''}`}
          >
            <div className="timer-zone">
              <div className="zone-row">
                <div
                  className="drag-handle"
                  title={t('dragSort')}
                  onPointerDown={(e) => onPointerDownHandle(e, activeTab.id, tm.id)}
                >
                  ⋮⋮
                </div>
                {isMobileTimerTitle ? (
                  <input
                    type="text"
                    className="timer-title-input timer-title-input--mobile"
                    placeholder={t('timerNamePlaceholder')}
                    value={clampTimerName(tm.name, false)}
                    maxLength={MAX_TIMER_NAME_LENGTH}
                    spellCheck={false}
                    onChange={(e) =>
                      updateTimer(activeTab.id, tm.id, (cur) => ({
                        ...cur,
                        name: clampTimerName(e.target.value, false),
                      }))
                    }
                  />
                ) : (
                  <textarea
                    className="timer-title-input timer-title-input--desktop"
                    placeholder={t('timerNamePlaceholder')}
                    value={tm.name}
                    maxLength={MAX_TIMER_NAME_LENGTH}
                    rows={1}
                    spellCheck={false}
                    ref={(el) => {
                      if (el) {
                        timerTitleTextareaRefs.current.set(tm.id, el)
                        requestAnimationFrame(() =>
                          adjustTimerTitleTextareaHeight(el),
                        )
                      } else {
                        timerTitleTextareaRefs.current.delete(tm.id)
                      }
                    }}
                    onChange={(e) => {
                      const v = clampTimerName(e.target.value, true)
                      updateTimer(activeTab.id, tm.id, (cur) => ({
                        ...cur,
                        name: v,
                      }))
                      requestAnimationFrame(() =>
                        adjustTimerTitleTextareaHeight(e.target),
                      )
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      if (!e.shiftKey) {
                        e.preventDefault()
                        return
                      }
                      if (e.currentTarget.value.includes('\n')) {
                        e.preventDefault()
                      }
                    }}
                  />
                )}
              </div>
            </div>

            <div className="timer-zone">
              <div className="zone-block">
                <div className="label-small">{t('countdownSetup')}</div>
                <div className="time-input-row">
                  <input type="number" value={tm.baseH} onChange={(e) => applyTimeFieldChange(activeTab.id, tm.id, 'baseH', e, tm.baseH)} />
                  <span>{t('hour')}</span>
                  <input type="number" value={tm.baseM} onChange={(e) => applyTimeFieldChange(activeTab.id, tm.id, 'baseM', e, tm.baseM)} />
                  <span>{t('minute')}</span>
                  <input type="number" value={tm.baseS} onChange={(e) => applyTimeFieldChange(activeTab.id, tm.id, 'baseS', e, tm.baseS)} />
                  <span>{t('second')}</span>
                </div>
              </div>
              <div className="zone-block">
                <div className="label-small">{t('delaySetup')}</div>
                <div className="time-input-row">
                  <input type="number" value={tm.delayM} onChange={(e) => applyTimeFieldChange(activeTab.id, tm.id, 'delayM', e, tm.delayM)} />
                  <span>{t('minute')}</span>
                  <input type="number" value={tm.delayS} onChange={(e) => applyTimeFieldChange(activeTab.id, tm.id, 'delayS', e, tm.delayS)} />
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
      </div>
      </div>

      <footer className="site-footer" role="contentinfo">
        {t('footerPlaceholder')}
      </footer>
      </div>

      {renameTabDialog && (
        <div className="rename-tab-backdrop">
          <div
            className="rename-tab-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-tab-heading"
          >
            <h2 id="rename-tab-heading" className="rename-tab-title">
              {t('renameTabPrompt')}
            </h2>
            <input
              id="rename-tab-input"
              className="rename-tab-input"
              type="text"
              value={renameTabDialog.value}
              maxLength={MAX_TAB_NAME_LENGTH}
              autoComplete="off"
              autoFocus
              onChange={(e) =>
                setRenameTabDialog((s) =>
                  s
                    ? {
                        ...s,
                        value: clampStringLen(
                          e.target.value,
                          MAX_TAB_NAME_LENGTH,
                        ),
                      }
                    : s,
                )
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  confirmRenameTab()
                }
              }}
            />
            <div className="rename-tab-actions">
              <button
                type="button"
                className="rename-tab-btn rename-tab-btn-primary"
                onClick={confirmRenameTab}
              >
                {t('renameTabSave')}
              </button>
              <button
                type="button"
                className="rename-tab-btn"
                onClick={() => setRenameTabDialog(null)}
              >
                {t('renameTabCancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
